/**
 * מיזוג חומרים לתצוגה.
 *
 * הבדיקות כאן שומרות על שני דברים: שמה שהדייר בחר הוא מה שמוצג, ושמה שלא
 * נבחר נשאר מפרט הסטנדרט.
 */

import { describe, expect, it } from "vitest";

import {
  FAMILY_DEFAULTS,
  MATERIAL_PRESETS,
  STANDARD_SURFACES,
  inferMaterialFamily,
} from "@/lib/visualization/material-library";
import { toMaterialAssignment } from "@/lib/visualization/materials";
import { resolveSurfaces } from "@/lib/visualization/resolve";
import { QUALITY_SETTINGS, resolveQuality } from "@/lib/visualization/quality";

describe("מפרט הסטנדרט", () => {
  it("לכל משטח יש חומר, גם ללא בחירה", () => {
    const resolved = resolveSurfaces([]);
    for (const [surface, material] of Object.entries(resolved)) {
      expect(material.baseColor, surface).toMatch(/^#[0-9a-f]{6}$/i);
      expect(material.roughness, surface).toBeGreaterThanOrEqual(0);
      expect(material.roughness, surface).toBeLessThanOrEqual(1);
      // חומר סטנדרט אינו נושא שם מוצר — הוא אינו בחירה של הדייר
      expect(material.sourceLabel).toBeUndefined();
    }
  });

  it("זכוכית שקופה, קיר אטום", () => {
    expect(STANDARD_SURFACES.windowFrame.opacity).toBeLessThan(1);
    expect(STANDARD_SURFACES.wall.opacity).toBeUndefined();
  });
});

describe("בחירת הדייר", () => {
  it("גוברת על הסטנדרט ונושאת את שם המוצר", () => {
    const resolved = resolveSurfaces([
      {
        surface: "interiorFloor",
        family: "CONCRETE",
        color: "#8e8c87",
        roughness: 0.8,
        metalness: 0,
        sourceLabel: "בטון 120×60 · בטון כהה",
      },
    ]);

    expect(resolved.interiorFloor.baseColor).toBe("#8e8c87");
    expect(resolved.interiorFloor.family).toBe("CONCRETE");
    expect(resolved.interiorFloor.sourceLabel).toBe("בטון 120×60 · בטון כהה");
    // שאר המשטחים לא זזו
    expect(resolved.wall.baseColor).toBe(STANDARD_SURFACES.wall.baseColor);
  });

  it("משפחת החומר קובעת את המרקם", () => {
    const resolved = resolveSurfaces([
      {
        surface: "kitchenFront",
        family: "WOOD",
        color: "#6b4a2f",
        roughness: 0.5,
        metalness: 0,
        sourceLabel: "מטבח אלון",
      },
    ]);

    expect(resolved.kitchenFront.texture?.pattern).toBe("WOOD_GRAIN");
    expect(resolved.countertop.texture?.pattern).toBe(
      STANDARD_SURFACES.countertop.texture?.pattern,
    );
  });
});

describe("גזירת משפחה ממוצר", () => {
  it("מזהה שיש, בטון, עץ ומתכת מהשם", () => {
    expect(inferMaterialFamily("אבן קיסר לבן")).toBe("MARBLE");
    expect(inferMaterialFamily("בטון 120×60")).toBe("CONCRETE");
    expect(inferMaterialFamily("פרקט אלון טבעי")).toBe("WOOD");
    expect(inferMaterialFamily("ברז שחור מט")).toBe("METAL");
  });

  it("שם שאינו מרמז על חומר נשאר בברירת המחדל", () => {
    expect(inferMaterialFamily("דגם 4821")).toBe("PAINT");
  });

  it("ברז שחור עדיין אינו צובע את האסלה", () => {
    expect(
      toMaterialAssignment(
        { category: "FIXTURE", family: "METAL", color: "#101010", roughness: 0.3, metalness: 0.9 },
        "ברז שחור מט",
      ),
    ).toBeNull();
  });

  it("ריצוף עם ברירת המחדל של העמודה מקבל משפחה מהשם", () => {
    const assignment = toMaterialAssignment(
      { category: "FLOOR", family: "PAINT", color: "#8e8c87", roughness: 0.7, metalness: 0 },
      "בטון 120×60 · בטון כהה",
    );
    expect(assignment?.family).toBe("CONCRETE");
  });
});

describe("ערכות מראה", () => {
  it("כל ערכה מצביעה על מק\"טים בלבד — לא על מוצרים שהומצאו", () => {
    expect(MATERIAL_PRESETS).toHaveLength(3);
    for (const preset of MATERIAL_PRESETS) {
      expect(preset.skus.length).toBeGreaterThan(0);
      for (const sku of preset.skus) {
        expect(sku).toMatch(/^[A-Z]{2}-/);
      }
    }
  });
});

describe("רמות איכות", () => {
  it("מצב ביצועים מוותר על אפקטים, לא על החומרים", () => {
    const performance = QUALITY_SETTINGS.PERFORMANCE;
    const high = QUALITY_SETTINGS.HIGH;

    expect(performance.postProcessing).toBe(false);
    expect(performance.shadows).toBe(false);
    expect(performance.maxTextureSize).toBeLessThan(high.maxTextureSize);
    expect(performance.maxDpr).toBeLessThan(high.maxDpr);
  });

  it("בחירה מפורשת נשמרת, אוטומט נפתר לרמה אמיתית", () => {
    expect(resolveQuality("HIGH")).toBe("HIGH");
    expect(["HIGH", "BALANCED", "PERFORMANCE"]).toContain(resolveQuality("AUTO"));
  });

  it("לכל משפחת חומר יש ברירות מחדל שלמות", () => {
    for (const [family, defaults] of Object.entries(FAMILY_DEFAULTS)) {
      expect(defaults.roughness, family).toBeGreaterThanOrEqual(0);
      expect(defaults.metalness, family).toBeGreaterThanOrEqual(0);
      expect(defaults.envIntensity, family).toBeGreaterThan(0);
    }
  });
});
