/**
 * גאומטריית הדירה.
 *
 * הבדיקות כאן מגנות על העיקרון שהכול נשען עליו: **הדירה בתלת-ממד היא הדירה
 * שבתוכנית**. לא דירת הדגמה, לא קואורדינטות שנכתבו ביד ברכיב תצוגה.
 */

import { describe, expect, it } from "vitest";

import { modifiedApartment42, standardApartment42 } from "@/lib/drawing/demo/apartment-42";
import { DemoGeometryProvider } from "@/lib/geometry/providers/demo";
import { GeometryUnsupportedError, type ApartmentGeometry } from "@/lib/geometry/types";
import { buildSceneModel } from "@/lib/three/scene-model";

const provider = new DemoGeometryProvider();

async function standardGeometry(): Promise<ApartmentGeometry> {
  return provider.loadFromPlan({
    document: standardApartment42(),
    apartmentId: "apartment-42",
    apartmentTypeId: "type-4",
    projectId: "project-1",
    planVersionId: "version-1",
  });
}

describe("גזירת גאומטריה מהתוכנית", () => {
  it("מחלצת חדרים, קירות, פתחים ורצפות", async () => {
    const geometry = await standardGeometry();

    expect(geometry.rooms.length).toBeGreaterThan(0);
    expect(geometry.walls.length).toBeGreaterThan(0);
    expect(geometry.openings.length).toBeGreaterThan(0);
    // לכל חדר רצפה ותקרה
    expect(geometry.floors).toHaveLength(geometry.rooms.length);
    expect(geometry.ceilings).toHaveLength(geometry.rooms.length);
  });

  it("ממירה סנטימטרים למטרים", async () => {
    const geometry = await standardGeometry();
    // מעטפת הדירה היא 11.6 × 9.0 מטר
    expect(geometry.bounds.sizeX).toBeGreaterThan(8);
    expect(geometry.bounds.sizeX).toBeLessThan(14);
    expect(geometry.bounds.sizeZ).toBeGreaterThan(6);
    expect(geometry.bounds.sizeZ).toBeLessThan(12);
  });

  it("מזהה סוג חדר מהתווית", async () => {
    const geometry = await standardGeometry();
    const kinds = new Set(geometry.rooms.map((room) => room.kind));

    expect(kinds.has("KITCHEN")).toBe(true);
    expect(kinds.has("BALCONY")).toBe(true);
    expect(kinds.has("SAFE_ROOM")).toBe(true);
  });

  it("מרפסת היא חלל חוץ ומקבלת מעקה", async () => {
    const geometry = await standardGeometry();
    const balconyRooms = geometry.rooms.filter((room) => room.isOutdoor);

    expect(balconyRooms.length).toBeGreaterThan(0);
    expect(geometry.balconies).toHaveLength(balconyRooms.length);
    expect(geometry.balconies[0].railingHeightM).toBeGreaterThan(1);

    const balconyFloor = geometry.floors.find((floor) => floor.roomId === balconyRooms[0].id);
    expect(balconyFloor?.isOutdoor).toBe(true);
  });

  it("מידות הפתחים סבירות — דלת בגובה אדם, חלון עם אדן", async () => {
    const geometry = await standardGeometry();

    for (const door of provider.getDoors(geometry)) {
      expect(door.heightM).toBeGreaterThanOrEqual(2);
      expect(door.sillHeightM).toBeLessThan(0.1);
    }

    for (const window of provider.getWindows(geometry)) {
      expect(window.sillHeightM).toBeGreaterThan(0.5);
      expect(window.heightM).toBeGreaterThan(1);
    }
  });

  it("נושאת את מקור הנתונים ואת מספר הגרסה", async () => {
    const geometry = await standardGeometry();

    expect(geometry.version.versionNo).toBe(1);
    expect(geometry.version.source.format).toBe("DEMO");
    expect(geometry.version.source.planVersionId).toBe("version-1");
    expect(geometry.apartmentTypeId).toBe("type-4");
  });

  it("אינה מתיימרת לקרוא BIM", async () => {
    await expect(
      provider.loadFromBIM({
        content: Buffer.from(""),
        fileName: "tower.ifc",
        format: "IFC",
      }),
    ).rejects.toBeInstanceOf(GeometryUnsupportedError);
  });
});

describe("טיפוסי דירות ושימוש חוזר", () => {
  it("דירה נגזרת מטיפוס הבסיס ומקבלת גרסה חדשה", async () => {
    const base = await standardGeometry();
    const apartment = await provider.generateGeometry({
      base,
      apartmentId: "apartment-18",
      createdBy: "user-1",
    });

    expect(apartment.apartmentId).toBe("apartment-18");
    expect(apartment.rooms).toHaveLength(base.rooms.length);
    expect(apartment.version.versionNo).toBe(base.version.versionNo + 1);
    expect(apartment.version.isOverride).toBe(false);
  });

  it("דירה חריגה מקבלת עקיפת גאומטריה מסומנת", async () => {
    const base = await standardGeometry();
    const penthouse = await provider.generateGeometry({
      base,
      apartmentId: "apartment-40",
      override: { rooms: base.rooms.slice(0, 3) },
      note: "פנטהאוז — מתאר שונה",
    });

    expect(penthouse.rooms).toHaveLength(3);
    expect(penthouse.version.isOverride).toBe(true);
    expect(penthouse.version.note).toBe("פנטהאוז — מתאר שונה");
  });
});

describe("שינויים מאושרים משנים את הגאומטריה", () => {
  it("הזזת קיר מזיזה את שני קצותיו ונרשמת בגרסה", async () => {
    const geometry = await standardGeometry();
    const wall = geometry.walls.find((candidate) => candidate.kind === "PARTITION");
    if (!wall) throw new Error("expected a partition in the demo plan");

    const updated = provider.applyApprovedChanges(geometry, [
      { changeItemId: "change-1", operation: "MOVE_WALL", targetId: wall.id, deltaX: 0.7 },
    ]);
    const moved = updated.walls.find((candidate) => candidate.id === wall.id);

    expect(moved?.start.x).toBeCloseTo(wall.start.x + 0.7, 3);
    expect(moved?.end.x).toBeCloseTo(wall.end.x + 0.7, 3);
    expect(updated.version.appliedChangeIds).toContain("change-1");
    expect(updated.version.versionNo).toBe(geometry.version.versionNo + 1);
  });

  it("קיר נושא אינו מוסר גם כאשר הגיעה בקשה מאושרת", async () => {
    const geometry = await standardGeometry();
    const structural = geometry.walls.find((wall) => wall.structural);
    if (!structural) throw new Error("expected a structural wall");

    const updated = provider.applyApprovedChanges(geometry, [
      { changeItemId: "change-2", operation: "REMOVE_WALL", targetId: structural.id },
    ]);

    expect(updated.walls.some((wall) => wall.id === structural.id)).toBe(true);
  });

  it("ללא שינויים — הגאומטריה נשארת כפי שהיא", async () => {
    const geometry = await standardGeometry();
    expect(provider.applyApprovedChanges(geometry, [])).toBe(geometry);
  });
});

describe("בדיקת תקינות", () => {
  it("תוכנית ההדגמה התקנית עוברת ללא שגיאות", async () => {
    const geometry = await standardGeometry();
    const errors = provider
      .validateGeometry(geometry)
      .filter((issue) => issue.severity === "ERROR");

    expect(errors).toHaveLength(0);
  });

  it("דירה ללא חדרים מסומנת כשגיאה", async () => {
    const geometry = await standardGeometry();
    const empty: ApartmentGeometry = { ...geometry, rooms: [], floors: [], ceilings: [] };
    const issues = provider.validateGeometry(empty);

    expect(issues.some((issue) => issue.code === "NO_ROOMS")).toBe(true);
  });

  it("קנה מידה שגוי מסומן כאזהרה — לא כאישור ולא כפסילה", async () => {
    const geometry = await standardGeometry();
    const broken: ApartmentGeometry = {
      ...geometry,
      rooms: geometry.rooms.map((room) => ({ ...room, areaSqm: room.areaSqm * 100 })),
    };
    const issues = provider.validateGeometry(broken);

    expect(issues.some((issue) => issue.code === "IMPLAUSIBLE_ROOM_AREA")).toBe(true);
    expect(issues.every((issue) => issue.severity !== "ERROR")).toBe(true);
  });
});

describe("הרנדרר צורך גאומטריה מנורמלת", () => {
  it("מודל הרינדור נבנה מהגאומטריה ולא מהשרטוט", async () => {
    const geometry = await standardGeometry();
    const scene = buildSceneModel(geometry);

    expect(scene.boxes.length).toBeGreaterThan(0);
    expect(scene.rooms).toHaveLength(geometry.rooms.length);
    expect(scene.size[0]).toBeCloseTo(geometry.bounds.sizeX, 3);
  });

  it("חיתוך 'בית בובות' נמוך מגובה הקיר האמיתי", async () => {
    const geometry = await standardGeometry();
    const dollhouse = buildSceneModel(geometry);
    const full = buildSceneModel(geometry, 2.7);

    const wallId = geometry.walls.find((wall) => wall.kind === "STRUCTURAL")?.id;
    const cut = dollhouse.boxes.find((box) => box.id === wallId);
    const whole = full.boxes.find((box) => box.id === wallId);

    expect(cut?.size[1]).toBe(1.35);
    expect(whole?.size[1]).toBe(2.7);
  });

  it("תוכנית משונה מייצרת גאומטריה משונה — התצוגה עוקבת אחרי התוכנית", async () => {
    const standard = await standardGeometry();
    const modified = await provider.loadFromPlan({
      document: modifiedApartment42(),
      apartmentId: "apartment-42",
    });

    expect(JSON.stringify(modified.walls)).not.toBe(JSON.stringify(standard.walls));
  });
});
