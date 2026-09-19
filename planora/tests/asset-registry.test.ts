/**
 * מרשם הנכסים ורמות הפירוט.
 *
 * העיקרון שנבדק כאן: אין כתובת נכס שנולדת בתוך רכיב תצוגה, ואין נכס
 * שהמערכת ממציאה למוצר שאין לו.
 */

import { describe, expect, it } from "vitest";

import {
  assetRegistry,
  registerSupplierAssets,
  type SupplierAssetSource,
} from "@/lib/visualization/asset-registry";
import { standardApartment42 } from "@/lib/drawing/demo/apartment-42";
import { DemoGeometryProvider } from "@/lib/geometry/providers/demo";
import { buildSceneModel } from "@/lib/three/scene-model";

describe("מרשם הנכסים", () => {
  it("הנכסים המובנים פרוצדורליים — אין קובץ להוריד", () => {
    for (const kind of ["MATERIAL", "TEXTURE", "HDRI", "FURNITURE"] as const) {
      const assets = assetRegistry.listByKind(kind);
      expect(assets.length, kind).toBeGreaterThan(0);
      for (const asset of assets.filter((item) => item.origin === "PROCEDURAL")) {
        expect(asset.url ?? null, asset.id).toBeNull();
      }
    }
  });

  it("מוצר ללא נכס אינו נרשם — אין המצאת כתובות", () => {
    const sources: SupplierAssetSource[] = [
      { productId: "p-empty", name: "מוצר ללא נכס", modelUrl: null, textureUrl: null },
    ];
    expect(registerSupplierAssets(sources)).toHaveLength(0);
    expect(assetRegistry.get("model:p-empty")).toBeNull();
    expect(assetRegistry.get("texture:p-empty")).toBeNull();
  });

  it("נכס ספק נרשם עם המוצר שממנו הגיע וחלופה לכשל", () => {
    const registered = registerSupplierAssets([
      {
        productId: "p-1",
        variantId: "v-1",
        supplierId: "s-1",
        name: "מטבח Urban · גרפיט",
        modelUrl: "https://example.test/urban.glb",
        textureUrl: "https://example.test/urban.ktx2",
      },
    ]);

    expect(registered).toHaveLength(2);

    const model = assetRegistry.get("model:p-1:v-1");
    expect(model?.origin).toBe("SUPPLIER");
    expect(model?.productId).toBe("p-1");
    expect(model?.variantId).toBe("v-1");
    // נכס שנכשל נופל חזרה למשהו שקיים, ולא מפיל את הסצנה
    expect(assetRegistry.fallbackFor("model:p-1:v-1")?.id).toBe("material:standard-surfaces");
    expect(assetRegistry.fallbackFor("texture:p-1:v-1")?.id).toBe("texture:procedural-library");
  });

  it("מזהה לא מוכר מחזיר null ולא כתובת מנוחשת", () => {
    expect(assetRegistry.resolve("model:does-not-exist")).toBeNull();
  });

  it("רשימת הטעינה המוקדמת כוללת את מה שכל דירה צריכה", () => {
    const ids = assetRegistry.preloadList().map((asset) => asset.id);
    expect(ids).toContain("material:standard-surfaces");
    expect(ids).toContain("texture:procedural-library");
  });
});

describe("רמת פירוט", () => {
  it("מצב ביצועים מוותר על הנוי ושומר את הרהיטים", async () => {
    const provider = new DemoGeometryProvider();
    const geometry = await provider.loadFromPlan({
      document: standardApartment42(),
      apartmentId: "apartment-42",
    });

    const full = buildSceneModel(geometry, 1.35, "FULL");
    const reduced = buildSceneModel(geometry, 1.35, "REDUCED");

    const staging = (model: typeof full) => model.boxes.filter((box) => box.kind === "STAGING");

    expect(staging(reduced).length).toBeLessThan(staging(full).length);
    // הספה והמיטה נשארות — הן מה שמלמד על גודל החדר
    expect(staging(reduced).some((box) => box.id.includes(":base"))).toBe(true);
    // הנוי נעלם
    expect(staging(reduced).some((box) => box.id.includes(":cushion"))).toBe(false);
    expect(staging(reduced).some((box) => box.id.includes(":rug"))).toBe(false);
  });
});
