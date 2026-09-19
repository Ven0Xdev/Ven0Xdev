/**
 * מיפוי חומרים לסצנה.
 *
 * כלל מחייב: חומר בתלת-ממד חייב להיות מקושר למוצר אמיתי שמאושר לפרויקט.
 * ברירות המחדל כאן מתארות את מפרט הסטנדרט, ולא "עיצוב" שהמערכת המציאה.
 */

import type { MaterialSlot } from "./scene-model";

export interface MaterialAppearance {
  color: string;
  roughness: number;
  metalness: number;
  /** שקיפות — לזכוכית בלבד */
  opacity?: number;
  /** שם המוצר שממנו נגזר החומר, להצגה בממשק */
  sourceLabel?: string;
}

/** מראה ברירת המחדל — מפרט הסטנדרט של הפרויקט */
export const DEFAULT_MATERIALS: Record<MaterialSlot, MaterialAppearance> = {
  interiorFloor: { color: "#cfc6b7", roughness: 0.62, metalness: 0.02 },
  outdoorFloor: { color: "#a89c8c", roughness: 0.92, metalness: 0 },
  // הקירות בהירים במכוון, כדי שהריצוף והמטבח יהיו הצבע הדומיננטי בסצנה
  wall: { color: "#fbfaf8", roughness: 0.96, metalness: 0 },
  partition: { color: "#f4f2ee", roughness: 0.96, metalness: 0 },
  railing: { color: "#9aa3ad", roughness: 0.4, metalness: 0.6 },
  kitchenFront: { color: "#e8e6e1", roughness: 0.55, metalness: 0.05 },
  countertop: { color: "#3f4750", roughness: 0.35, metalness: 0.1 },
  doorLeaf: { color: "#e7e3dc", roughness: 0.7, metalness: 0 },
  windowFrame: { color: "#a9c6d8", roughness: 0.15, metalness: 0.1, opacity: 0.35 },
  sanitary: { color: "#fbfbfa", roughness: 0.25, metalness: 0 },
};

/** תיאור חומר שמגיע ממוצר שנבחר */
export interface ProductMaterial {
  slot: MaterialSlot;
  color: string;
  roughness: number;
  metalness: number;
  sourceLabel: string;
}

/**
 * ממזג את חומרי ברירת המחדל עם החומרים של המוצרים שהדייר בחר.
 * חומר ללא מוצר מקושר לעולם אינו נכנס לסצנה.
 */
export function resolveMaterials(
  productMaterials: ProductMaterial[],
): Record<MaterialSlot, MaterialAppearance> {
  const resolved: Record<MaterialSlot, MaterialAppearance> = { ...DEFAULT_MATERIALS };

  for (const material of productMaterials) {
    resolved[material.slot] = {
      ...resolved[material.slot],
      color: material.color,
      roughness: material.roughness,
      metalness: material.metalness,
      sourceLabel: material.sourceLabel,
    };
  }

  return resolved;
}

/**
 * מיפוי קטגוריית חומר במסד הנתונים למשבצת בסצנה.
 *
 * קבועות סניטריות (FIXTURE) אינן ממופות בכוונה: ברז בגוון שחור אינו הופך את
 * האסלה והאמבטיה לשחורות. מוצגים רק חומרים שהתצוגה יודעת לייצג נאמנה.
 */
export const MATERIAL_CATEGORY_TO_SLOT: Record<string, MaterialSlot> = {
  FLOOR: "interiorFloor",
  WALL: "wall",
  COUNTERTOP: "countertop",
  CABINET_FRONT: "kitchenFront",
  DOOR: "doorLeaf",
  OUTDOOR: "outdoorFloor",
};

// ---------------------------------------------------------------------------
// תאורת סצנה לפי שעה ביום
// ---------------------------------------------------------------------------

export interface SceneLighting {
  skyColor: string;
  groundColor: string;
  ambientIntensity: number;
  sunIntensity: number;
  sunColor: string;
  sunPosition: [number, number, number];
  /** תאורה פנימית מלאכותית */
  interiorIntensity: number;
  background: string;
}

export const SCENE_LIGHTING: Record<"MORNING" | "MIDDAY" | "SUNSET" | "NIGHT", SceneLighting> = {
  MORNING: {
    skyColor: "#cfe3f2",
    groundColor: "#d8d2c8",
    ambientIntensity: 0.55,
    sunIntensity: 1.5,
    sunColor: "#fff0dc",
    sunPosition: [8, 9, 6],
    interiorIntensity: 0.15,
    background: "#e8f1f8",
  },
  MIDDAY: {
    skyColor: "#dceaf5",
    groundColor: "#ddd8cf",
    ambientIntensity: 0.7,
    sunIntensity: 2.1,
    sunColor: "#ffffff",
    sunPosition: [3, 14, 3],
    interiorIntensity: 0.1,
    background: "#eef4f9",
  },
  SUNSET: {
    skyColor: "#f3d9c4",
    groundColor: "#b9a893",
    ambientIntensity: 0.4,
    sunIntensity: 1.6,
    sunColor: "#ffb277",
    sunPosition: [-11, 3.5, 5],
    interiorIntensity: 0.45,
    background: "#f6e2d0",
  },
  NIGHT: {
    skyColor: "#1b2436",
    groundColor: "#12161f",
    ambientIntensity: 0.16,
    sunIntensity: 0.18,
    sunColor: "#9fb6d8",
    sunPosition: [-6, 8, -6],
    interiorIntensity: 1.25,
    background: "#161c28",
  },
};
