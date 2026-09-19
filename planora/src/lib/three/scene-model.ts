/**
 * גזירת מודל תלת-ממד מתוכנית הדירה.
 *
 * אין כאן קובץ מודל נפרד. התצוגה התלת-ממדית נבנית מאותו `DrawingDocument`
 * שמשמש את ההשוואה הדו-ממדית, כך שהתוכנית והתלת-ממד לעולם לא יוצאים מסנכרון.
 *
 * מערכת הצירים: תוכנית (x, y) בסנטימטרים → סצנה (x, z) במטרים, ציר Y כלפי מעלה.
 */

import type { DrawingDocument, DrawingElement } from "@/lib/drawing/types";

/** גובה חלל פנימי סטנדרטי במטרים */
export const CEILING_HEIGHT_M = 2.7;
const WALL_HEIGHT_M = 2.7;
const RAILING_HEIGHT_M = 1.05;
const CM_TO_M = 0.01;

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

export interface SceneModel {
  boxes: SceneBox[];
  /** מרכז הדירה, לצורך מיקום המצלמה */
  center: [number, number];
  /** מידות כוללות במטרים */
  size: [number, number];
  rooms: { id: string; label: string; center: [number, number]; area: number }[];
}

const OUTDOOR_ROOMS = ["מרפסת שמש"];

function toMeters(value: number): number {
  return Math.round(value * CM_TO_M * 1000) / 1000;
}

function boxFromElement(
  element: DrawingElement,
  kind: SurfaceKind,
  options: {
    height: number;
    baseY?: number;
    materialSlot: MaterialSlot;
    selectable?: boolean;
    category?: SceneBox["category"];
  },
): SceneBox {
  const width = toMeters(element.width);
  const depth = toMeters(element.height);
  const x = toMeters(element.x) + width / 2;
  const z = toMeters(element.y) + depth / 2;
  const baseY = options.baseY ?? 0;

  return {
    id: element.id,
    kind,
    position: [x, baseY + options.height / 2, z],
    size: [width, options.height, depth],
    label: element.metadata?.label as string | undefined,
    materialSlot: options.materialSlot,
    selectable: options.selectable ?? false,
    category: options.category,
  };
}

/**
 * בונה את מודל הסצנה מהתוכנית.
 * פונקציה טהורה — ניתנת לבדיקה ללא דפדפן.
 */
export function buildSceneModel(document: DrawingDocument): SceneModel {
  const boxes: SceneBox[] = [];
  const rooms: SceneModel["rooms"] = [];

  for (const element of document.elements) {
    switch (element.type) {
      case "ROOM": {
        const label = (element.metadata?.label as string | undefined) ?? "";
        const isOutdoor = OUTDOOR_ROOMS.includes(label);

        boxes.push(
          boxFromElement(element, "FLOOR", {
            height: 0.04,
            baseY: -0.04,
            materialSlot: isOutdoor ? "outdoorFloor" : "interiorFloor",
            selectable: true,
            category: isOutdoor ? "OUTDOOR" : "FLOORING",
          }),
        );

        const width = toMeters(element.width);
        const depth = toMeters(element.height);
        rooms.push({
          id: element.id,
          label,
          center: [toMeters(element.x) + width / 2, toMeters(element.y) + depth / 2],
          area: Math.round(width * depth * 10) / 10,
        });
        break;
      }

      case "WALL":
        boxes.push(
          boxFromElement(element, "WALL", {
            height: WALL_HEIGHT_M,
            materialSlot: "wall",
          }),
        );
        break;

      case "PARTITION":
        boxes.push(
          boxFromElement(element, "PARTITION", {
            height: WALL_HEIGHT_M,
            materialSlot: "partition",
          }),
        );
        break;

      case "RAILING":
        boxes.push(
          boxFromElement(element, "RAILING", {
            height: RAILING_HEIGHT_M,
            materialSlot: "railing",
          }),
        );
        break;

      // פתח בקיר: משקוף עליון בלבד, כך שנוצר מעבר פתוח
      case "DOOR":
        boxes.push(
          boxFromElement(element, "DOOR", {
            height: WALL_HEIGHT_M - 2.1,
            baseY: 2.1,
            materialSlot: "doorLeaf",
            selectable: true,
            category: "DOORS",
          }),
        );
        break;

      case "WINDOW":
      case "SLIDING_DOOR": {
        const isSliding = element.type === "SLIDING_DOOR";
        const sillHeight = isSliding ? 0 : 0.95;
        const openingHeight = isSliding ? 2.2 : 1.35;

        // אדן ומשקוף — הזכוכית עצמה מצוירת כמשטח שקוף
        if (sillHeight > 0) {
          boxes.push(
            boxFromElement(element, "WALL", {
              height: sillHeight,
              materialSlot: "wall",
            }),
          );
        }
        boxes.push(
          boxFromElement(element, "WINDOW", {
            height: openingHeight,
            baseY: sillHeight,
            materialSlot: "windowFrame",
          }),
        );
        boxes.push(
          boxFromElement(element, "WALL", {
            height: Math.max(0, WALL_HEIGHT_M - sillHeight - openingHeight),
            baseY: sillHeight + openingHeight,
            materialSlot: "wall",
          }),
        );
        break;
      }

      case "KITCHEN_UNIT": {
        const label = (element.metadata?.label as string | undefined) ?? "";
        const isCounter = label.includes("ארון") || label.includes("כיריים");
        boxes.push(
          boxFromElement(element, "KITCHEN", {
            height: isCounter ? 0.9 : 0.85,
            materialSlot: isCounter ? "kitchenFront" : "countertop",
            selectable: true,
            category: "KITCHEN",
          }),
        );
        break;
      }

      case "SANITARY":
        boxes.push(
          boxFromElement(element, "SANITARY", {
            height: 0.45,
            materialSlot: "sanitary",
            selectable: true,
            category: "SANITARY",
          }),
        );
        break;

      default:
        break;
    }
  }

  const xs = boxes.map((box) => box.position[0]);
  const zs = boxes.map((box) => box.position[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    boxes,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxZ - minZ],
    rooms,
  };
}
