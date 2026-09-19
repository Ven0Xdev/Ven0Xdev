/**
 * גזירת מודל הרינדור מגאומטריית הדירה.
 *
 * הרנדרר צורך **גאומטריה מנורמלת** (`ApartmentGeometry`) ולא את קובץ השרטוט.
 * הגאומטריה עצמה נגזרת מהתוכנית שהקבלן העלה, ולכן התוכנית והתלת-ממד אינם
 * יכולים לצאת מסנכרון — ובה בעת, כשייכתב מעבד DWG אמיתי, שום דבר כאן לא ישתנה.
 *
 * מערכת הצירים כאן זהה לזו של הגאומטריה: מטרים, x/z במישור הרצפה, y כלפי מעלה.
 */

import type { ApartmentGeometry, Vec2 } from "@/lib/geometry/types";

/** גובה חלל פנימי סטנדרטי במטרים */
export const CEILING_HEIGHT_M = 2.7;

/**
 * גובה החיתוך בתצוגת "בית בובות".
 *
 * הקירות נחתכים נמוך מהגובה האמיתי — מוסכמה מקובלת בתצוגת דירה, שמאפשרת
 * לראות את כל הדירה מלמעלה. הגובה האמיתי נשמר בגאומטריה לשימוש במצב סיור.
 */
export const DOLLHOUSE_CUT_M = 1.35;

export type SurfaceKind =
  | "WALL"
  | "PARTITION"
  | "RAILING"
  | "FLOOR"
  | "DOOR"
  | "WINDOW"
  | "KITCHEN"
  | "SANITARY"
  | "FIXTURE";

export interface SceneBox {
  id: string;
  kind: SurfaceKind;
  /** מרכז התיבה במטרים */
  position: [number, number, number];
  /** מידות התיבה במטרים */
  size: [number, number, number];
  label?: string;
  /** מזהה החומר שמוחל על המשטח — נקבע לפי בחירת הדייר */
  materialSlot: MaterialSlot;
  /** האם ניתן ללחוץ על האובייקט ולפתוח את אפשרויות הבחירה */
  selectable: boolean;
  /** הקטגוריה שנפתחת בלחיצה */
  category?: "KITCHEN" | "FLOORING" | "SANITARY" | "DOORS" | "OUTDOOR";
}

/** משבצות חומר שהתצורה יכולה להחליף */
export type MaterialSlot =
  | "interiorFloor"
  | "outdoorFloor"
  | "wall"
  | "partition"
  | "railing"
  | "kitchenFront"
  | "countertop"
  | "doorLeaf"
  | "windowFrame"
  | "sanitary";

export interface SceneRoom {
  id: string;
  label: string;
  center: [number, number];
  area: number;
  isOutdoor: boolean;
}

export interface SceneModel {
  boxes: SceneBox[];
  /** מרכז הדירה, לצורך מיקום המצלמה */
  center: [number, number];
  /** מידות כוללות במטרים */
  size: [number, number];
  rooms: SceneRoom[];
}

function outlineBox(outline: Vec2[]): { center: Vec2; width: number; depth: number } {
  const xs = outline.map((point) => point.x);
  const zs = outline.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

/**
 * בונה את מודל הרינדור.
 * פונקציה טהורה — ניתנת לבדיקה ללא דפדפן.
 *
 * @param cutHeightM גובה חיתוך הקירות. ברירת המחדל היא תצוגת "בית בובות";
 *                   מצב סיור יבקש את הגובה המלא.
 */
export function buildSceneModel(
  geometry: ApartmentGeometry,
  cutHeightM: number = DOLLHOUSE_CUT_M,
): SceneModel {
  const boxes: SceneBox[] = [];
  const roomById = new Map(geometry.rooms.map((room) => [room.id, room]));

  // --- רצפות ---
  for (const floor of geometry.floors) {
    const { center, width, depth } = outlineBox(floor.outline);
    const room = roomById.get(floor.roomId);

    boxes.push({
      id: floor.id,
      kind: "FLOOR",
      position: [center.x, floor.levelM - floor.thicknessM / 2, center.z],
      size: [width, floor.thicknessM, depth],
      label: room?.label,
      materialSlot: floor.isOutdoor ? "outdoorFloor" : "interiorFloor",
      selectable: true,
      category: floor.isOutdoor ? "OUTDOOR" : "FLOORING",
    });
  }

  // --- קירות, מחיצות ומעקות ---
  for (const wall of geometry.walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    if (length === 0) continue;

    const horizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.z - wall.start.z);
    const height = Math.min(wall.heightM, wall.kind === "RAILING" ? wall.heightM : cutHeightM);

    boxes.push({
      id: wall.id,
      kind: wall.kind === "STRUCTURAL" ? "WALL" : wall.kind === "PARTITION" ? "PARTITION" : "RAILING",
      position: [
        (wall.start.x + wall.end.x) / 2,
        height / 2,
        (wall.start.z + wall.end.z) / 2,
      ],
      size: horizontal
        ? [length, height, wall.thicknessM]
        : [wall.thicknessM, height, length],
      materialSlot:
        wall.kind === "STRUCTURAL" ? "wall" : wall.kind === "PARTITION" ? "partition" : "railing",
      selectable: false,
    });
  }

  // --- פתחים ---
  for (const opening of geometry.openings) {
    const horizontal = Math.abs(Math.cos(opening.rotationRad)) >= Math.abs(Math.sin(opening.rotationRad));
    const footprint: [number, number] = horizontal
      ? [opening.widthM, opening.depthM]
      : [opening.depthM, opening.widthM];

    if (opening.kind === "DOOR") {
      // דלת פנים: סף נמוך בלבד, כך שנוצר מעבר פתוח וברור בתצוגה מלמעלה
      boxes.push({
        id: opening.id,
        kind: "DOOR",
        position: [opening.center.x, 0.035, opening.center.z],
        size: [footprint[0], 0.07, footprint[1]],
        label: opening.label,
        materialSlot: "doorLeaf",
        selectable: true,
        category: "DOORS",
      });
      continue;
    }

    // מתחת לחלון — קיר מלא עד גובה האדן
    if (opening.sillHeightM > 0.05) {
      boxes.push({
        id: `${opening.id}:sill`,
        kind: "WALL",
        position: [opening.center.x, opening.sillHeightM / 2, opening.center.z],
        size: [footprint[0], opening.sillHeightM, footprint[1]],
        materialSlot: "wall",
        selectable: false,
      });
    }

    // הזכוכית — עד גובה החיתוך של התצוגה
    const glassHeight = Math.max(0.2, Math.min(opening.heightM, cutHeightM - opening.sillHeightM));
    boxes.push({
      id: opening.id,
      kind: "WINDOW",
      position: [opening.center.x, opening.sillHeightM + glassHeight / 2, opening.center.z],
      size: [footprint[0], glassHeight, footprint[1]],
      label: opening.label,
      materialSlot: "windowFrame",
      selectable: false,
    });
  }

  // --- מטבח וכלים סניטריים ---
  for (const fixture of geometry.fixtures) {
    const isSanitary = fixture.kind === "SANITARY";
    boxes.push({
      id: fixture.id,
      kind: isSanitary ? "SANITARY" : "KITCHEN",
      position: [fixture.center.x, fixture.heightM / 2, fixture.center.z],
      size: [fixture.widthM, fixture.heightM, fixture.depthM],
      label: fixture.label,
      materialSlot:
        fixture.kind === "KITCHEN_COUNTER"
          ? "countertop"
          : fixture.kind === "KITCHEN_CABINET"
            ? "kitchenFront"
            : "sanitary",
      selectable: true,
      category: isSanitary ? "SANITARY" : "KITCHEN",
    });
  }

  return {
    boxes,
    center: [geometry.bounds.center.x, geometry.bounds.center.z],
    size: [geometry.bounds.sizeX, geometry.bounds.sizeZ],
    rooms: geometry.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      center: [room.center.x, room.center.z],
      area: room.areaSqm,
      isOutdoor: room.isOutdoor,
    })),
  };
}
