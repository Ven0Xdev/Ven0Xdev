/**
 * חוזה מנוע ההדמיה.
 *
 * הבדיקות כאן אינן בודקות "איך זה נראה" — הן בודקות שהחוזה שהמסכים נשענים
 * עליו מתקיים, כך שהחלפת המנוע בעתיד לא תשבור את הפורטל.
 */

import { describe, expect, it } from "vitest";

import { standardApartment42 } from "@/lib/drawing/demo/apartment-42";
import {
  createVisualizationProvider,
  isVisualizationProviderId,
  resolveVisualizationProviderId,
  type ApartmentVisualizationProvider,
} from "@/lib/visualization/provider";
import { R3FVisualizationProvider } from "@/lib/visualization/providers/r3f";
import { DemoGeometryProvider } from "@/lib/geometry/providers/demo";
import { UnrealPixelStreamingProvider } from "@/lib/visualization/providers/unreal-pixel-streaming";
import { toMaterialAssignment } from "@/lib/visualization/materials";
import {
  VisualizationUnsupportedError,
  type MaterialAssignment,
  type VisualizationState,
} from "@/lib/visualization/types";

const DOCUMENT = standardApartment42();
const geometryProvider = new DemoGeometryProvider();
const GEOMETRY = await geometryProvider.loadFromPlan({
  document: DOCUMENT,
  apartmentId: "apartment-42",
});

const DARK_FLOOR: MaterialAssignment = {
  surface: "interiorFloor",
  color: "#3a3a3a",
  roughness: 0.5,
  metalness: 0.05,
  sourceLabel: "בטון כהה · אפור",
  productId: "product-floor",
  variantId: "variant-graphite",
};

async function loadedViewer(): Promise<R3FVisualizationProvider> {
  const provider = new R3FVisualizationProvider();
  await provider.loadApartment({ apartmentId: "apartment-42", geometry: GEOMETRY });
  return provider;
}

describe("בחירת מנוע", () => {
  it("ברירת המחדל היא מנוע האב-טיפוס", () => {
    expect(resolveVisualizationProviderId()).toBe("r3f-webgl");
  });

  it("מזהה מנוע לא מוכר אינו מתקבל", () => {
    expect(isVisualizationProviderId("r3f-webgl")).toBe(true);
    expect(isVisualizationProviderId("unreal-pixel-streaming")).toBe(true);
    expect(isVisualizationProviderId("blender")).toBe(false);
  });

  it("המפעל מחזיר את המנוע המבוקש", async () => {
    await expect(createVisualizationProvider("r3f-webgl")).resolves.toBeInstanceOf(
      R3FVisualizationProvider,
    );
    await expect(createVisualizationProvider("unreal-pixel-streaming")).resolves.toBeInstanceOf(
      UnrealPixelStreamingProvider,
    );
  });

  it("כל מנוע מממש את אותן פעולות", async () => {
    const methods: (keyof ApartmentVisualizationProvider)[] = [
      "loadApartment",
      "loadConfiguration",
      "applyMaterial",
      "applyProductVariant",
      "setTimeOfDay",
      "setExteriorEnvironment",
      "focusRoom",
      "startWalkthrough",
      "stopWalkthrough",
      "setQualityMode",
      "resetScene",
      "getState",
      "subscribe",
      "dispose",
    ];

    for (const provider of [
      new R3FVisualizationProvider(),
      new UnrealPixelStreamingProvider(),
    ]) {
      for (const method of methods) {
        expect(typeof provider[method], `${provider.id}.${String(method)}`).toBe("function");
      }
    }
  });
});

describe("מנוע התצוגה בדפדפן", () => {
  it("טוען את הדירה מתוך התוכנית ומחזיר סצנה מקומית", async () => {
    const provider = await loadedViewer();
    const state = provider.getState();

    expect(state.status).toBe("READY");
    expect(state.apartmentId).toBe("apartment-42");
    expect(state.rooms.length).toBeGreaterThan(0);
    expect(state.presentation?.kind).toBe("LOCAL_SCENE");
  });

  it("מצהיר שאינו פוטוריאליסטי ואינו דורש שרת רינדור", () => {
    const { capabilities } = new R3FVisualizationProvider();
    expect(capabilities.photorealistic).toBe(false);
    expect(capabilities.globalIllumination).toBe(false);
    expect(capabilities.runsInBrowser).toBe(true);
    expect(capabilities.requiresStreaming).toBe(false);
  });

  it("מחיל חומר של מוצר על המשטח המבוקש", async () => {
    const provider = await loadedViewer();
    const state = await provider.loadConfiguration({ materials: [DARK_FLOOR] });

    expect(state.presentation?.kind).toBe("LOCAL_SCENE");
    if (state.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    expect(state.presentation.materials.interiorFloor.baseColor).toBe("#3a3a3a");
    expect(state.presentation.materials.interiorFloor.sourceLabel).toBe("בטון כהה · אפור");
  });

  it("חומר בודד אינו נוגע במשטחים אחרים", async () => {
    const provider = await loadedViewer();
    const before = provider.getState();
    if (before.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    const wallBefore = before.presentation.materials.wall.baseColor;

    const after = await provider.applyMaterial({
      surface: "interiorFloor",
      material: { ...DARK_FLOOR },
    });
    if (after.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");

    expect(after.presentation.materials.interiorFloor.baseColor).toBe("#3a3a3a");
    expect(after.presentation.materials.wall.baseColor).toBe(wallBefore);
  });

  it("ביטול חומר מחזיר את מפרט הסטנדרט", async () => {
    const provider = await loadedViewer();
    const standard = provider.getState();
    if (standard.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    const standardFloor = standard.presentation.materials.interiorFloor.baseColor;

    await provider.applyMaterial({ surface: "interiorFloor", material: { ...DARK_FLOOR } });
    const reset = await provider.applyMaterial({ surface: "interiorFloor", material: null });
    if (reset.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");

    expect(reset.presentation.materials.interiorFloor.baseColor).toBe(standardFloor);
  });

  it("וריאנט של מוצר יכול לגעת בכמה משטחים יחד", async () => {
    const provider = await loadedViewer();
    const state = await provider.applyProductVariant({
      productId: "product-kitchen",
      variantId: "variant-urban",
      materials: [
        {
          surface: "kitchenFront",
          color: "#2f3438",
          roughness: 0.4,
          metalness: 0.08,
          sourceLabel: "מטבח אורבני",
        },
        {
          surface: "countertop",
          color: "#101418",
          roughness: 0.3,
          metalness: 0.1,
          sourceLabel: "מטבח אורבני",
        },
      ],
    });
    if (state.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");

    expect(state.presentation.materials.kitchenFront.baseColor).toBe("#2f3438");
    expect(state.presentation.materials.countertop.baseColor).toBe("#101418");
  });

  it("שעה ביום משנה את התאורה", async () => {
    const provider = await loadedViewer();
    const midday = provider.getState();
    const night = await provider.setTimeOfDay("NIGHT");

    if (midday.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    if (night.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");

    expect(night.timeOfDay).toBe("NIGHT");
    expect(night.presentation.lighting.background).not.toBe(
      midday.presentation.lighting.background,
    );
    expect(night.presentation.lighting.interiorIntensity).toBeGreaterThan(
      midday.presentation.lighting.interiorIntensity,
    );
  });

  it("מיקוד בחדר שאינו קיים אינו משנה את המיקוד", async () => {
    const provider = await loadedViewer();
    const room = provider.getState().rooms[0];

    const focused = await provider.focusRoom(room.id);
    expect(focused.focusedRoomId).toBe(room.id);

    const missing = await provider.focusRoom("no-such-room");
    expect(missing.focusedRoomId).toBe(room.id);
    expect(missing.message).toBeTruthy();
  });

  it("סיור ויציאה ממנו מחליפים מצב מצלמה", async () => {
    const provider = await loadedViewer();
    expect((await provider.startWalkthrough()).cameraMode).toBe("WALK");
    expect((await provider.stopWalkthrough()).cameraMode).toBe("ORBIT");
  });

  it("מודיע שאינו מרנדר את הנוף מסביב לבניין", async () => {
    const provider = await loadedViewer();
    const state = await provider.setExteriorEnvironment({ viewType: "SEA", floorHeightM: 18 });
    expect(state.environment?.viewType).toBe("SEA");
    expect(state.message).toBeTruthy();
  });

  it("מאזין מקבל את המצב מיד ובכל שינוי", async () => {
    const provider = await loadedViewer();
    const seen: VisualizationState[] = [];
    const unsubscribe = provider.subscribe((state) => seen.push(state));

    expect(seen).toHaveLength(1);
    await provider.setTimeOfDay("SUNSET");
    expect(seen).toHaveLength(2);
    expect(seen[1].timeOfDay).toBe("SUNSET");

    unsubscribe();
    await provider.setTimeOfDay("MORNING");
    expect(seen).toHaveLength(2);
  });

  it("שימוש אחרי שחרור המשאבים נכשל במפורש", async () => {
    const provider = await loadedViewer();
    provider.dispose();
    await expect(provider.setTimeOfDay("NIGHT")).rejects.toThrow();
  });
});

describe("מנוע פוטוריאליסטי עתידי", () => {
  it("מצהיר על היכולות שהוא אמור לספק", () => {
    const { capabilities } = new UnrealPixelStreamingProvider();
    expect(capabilities.photorealistic).toBe(true);
    expect(capabilities.globalIllumination).toBe(true);
    expect(capabilities.reflections).toBe(true);
    expect(capabilities.requiresStreaming).toBe(true);
    expect(capabilities.runsInBrowser).toBe(false);
  });

  it("נכשל במפורש ואינו מחזיר דירה ריקה", async () => {
    const provider = new UnrealPixelStreamingProvider();
    await expect(
      provider.loadApartment({ apartmentId: "apartment-42", geometry: GEOMETRY }),
    ).rejects.toBeInstanceOf(VisualizationUnsupportedError);
    expect(provider.getState().status).toBe("UNSUPPORTED");
    expect(provider.getState().presentation).toBeNull();
  });
});

describe("גזירת חומרים ממוצרים", () => {
  it("ממפה קטגוריות שהתצוגה יודעת לייצג", () => {
    const assignment = toMaterialAssignment(
      { category: "FLOOR", color: "#cccccc", roughness: 0.6, metalness: 0, productId: "p1" },
      "ריצוף סטנדרט",
    );
    expect(assignment?.surface).toBe("interiorFloor");
    expect(assignment?.productId).toBe("p1");
  });

  it("קבועה סניטרית אינה צובעת משטח — ברז שחור אינו הופך את האסלה לשחורה", () => {
    expect(
      toMaterialAssignment(
        { category: "FIXTURE", color: "#000000", roughness: 0.2, metalness: 0.9 },
        "ברז שחור",
      ),
    ).toBeNull();
  });
});

describe("רמת איכות", () => {
  it("מתחילה במצב אוטומטי", async () => {
    const provider = await loadedViewer();
    expect(provider.getState().qualityMode).toBe("AUTO");
    expect(["HIGH", "BALANCED", "PERFORMANCE"]).toContain(provider.getState().effectiveQuality);
  });

  it("בחירה ידנית גוברת על הזיהוי האוטומטי", async () => {
    const provider = await loadedViewer();
    const state = await provider.setQualityMode("PERFORMANCE");
    expect(state.effectiveQuality).toBe("PERFORMANCE");
    // מצב ביצועים מוותר על צללים ועל אפקטים, ולא על נאמנות הדירה
    expect(provider.qualitySettings.shadows).toBe(false);
    expect(provider.qualitySettings.postProcessing).toBe(false);
  });

  it("איפוס מחזיר את מפרט הסטנדרט ואת מבט הפתיחה", async () => {
    const provider = await loadedViewer();
    const standard = provider.getState();
    if (standard.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    const standardFloor = standard.presentation.materials.interiorFloor.baseColor;

    await provider.loadConfiguration({ materials: [DARK_FLOOR] });
    await provider.setTimeOfDay("NIGHT");
    await provider.startWalkthrough();

    const reset = await provider.resetScene();
    if (reset.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");

    expect(reset.presentation.materials.interiorFloor.baseColor).toBe(standardFloor);
    expect(reset.timeOfDay).toBe("MIDDAY");
    expect(reset.cameraMode).toBe("ORBIT");
    // הדירה עצמה נשארת טעונה — איפוס אינו טעינה מחדש
    expect(reset.status).toBe("READY");
    expect(reset.rooms.length).toBeGreaterThan(0);
  });
});

describe("ניווט וסיור", () => {
  it("מציע סיור שמתחיל בסלון ונגמר במרפסת", async () => {
    const provider = await loadedViewer();
    const { suggestedTour, rooms } = provider.getState();

    expect(suggestedTour.length).toBeGreaterThan(2);
    const labels = suggestedTour.map(
      (id) => rooms.find((room) => room.id === id)?.label ?? "",
    );
    expect(labels[0]).toMatch(/סלון/);
    expect(labels.at(-1)).toMatch(/מרפסת/);
    // חדר אחד מכל סוג — סיור בשלושה חדרי שינה מייגע
    expect(new Set(suggestedTour).size).toBe(suggestedTour.length);
  });

  it("סיור מודרך נכנס למצב הליכה ושומר את המסלול", async () => {
    const provider = await loadedViewer();
    const tour = provider.getState().suggestedTour;
    const state = await provider.startWalkthrough({ path: tour, loop: true });

    expect(state.cameraMode).toBe("WALK");
    expect(state.tourPath).toEqual(tour);
  });

  it("חדר שאינו בדירה אינו נכנס למסלול", async () => {
    const provider = await loadedViewer();
    const state = await provider.startWalkthrough({ path: ["no-such-room"] });
    expect(state.tourPath).toEqual([]);
  });

  it("במצב סיור הקירות עומדים בגובהם האמיתי", async () => {
    const provider = await loadedViewer();

    const dollhouse = provider.getState();
    if (dollhouse.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    const scene = dollhouse.presentation.scene as { boxes: { kind: string; size: number[] }[] };
    const cutWall = scene.boxes.find((box) => box.kind === "WALL");

    const walking = await provider.startWalkthrough();
    if (walking.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    const walkScene = walking.presentation.scene as {
      boxes: { kind: string; size: number[] }[];
    };
    const fullWall = walkScene.boxes.find((box) => box.kind === "WALL");

    expect(cutWall?.size[1]).toBe(1.35);
    expect(fullWall?.size[1]).toBe(2.7);

    // יציאה מהסיור מחזירה את חתך "בית הבובות"
    const back = await provider.stopWalkthrough();
    if (back.presentation?.kind !== "LOCAL_SCENE") throw new Error("expected local scene");
    const backScene = back.presentation.scene as { boxes: { kind: string; size: number[] }[] };
    expect(backScene.boxes.find((box) => box.kind === "WALL")?.size[1]).toBe(1.35);
    expect(back.tourPath).toEqual([]);
  });

  it("המנוע מדווח שהוא יודע לנווט לחדר ולסייר, אך אינו קולנועי", () => {
    const { capabilities } = new R3FVisualizationProvider();
    expect(capabilities.roomNavigation).toBe(true);
    expect(capabilities.guidedTour).toBe(true);
    // אין מסלולי מצלמה מתוסרטים ואין עומק שדה
    expect(capabilities.cinematicCamera).toBe(false);
  });
});
