/**
 * גזירת חומרי הדמיה ממוצרי הספקים.
 *
 * כלל מחייב: חומר שמוצג בתלת-ממד חייב להיות מקושר למוצר אמיתי שאושר לפרויקט.
 * המיפוי כאן אינו תלוי במנוע — גם מנוע פוטוריאליסטי עתידי יקבל את אותם
 * `MaterialAssignment`.
 */

import type { MaterialCategory } from "@prisma/client";
import type { MaterialAssignment, MaterialSurface } from "./types";

/**
 * מיפוי קטגוריית חומר במסד הנתונים למשטח בתצוגה.
 *
 * קבועות סניטריות (FIXTURE) אינן ממופות בכוונה: ברז בגוון שחור אינו הופך את
 * האסלה והאמבטיה לשחורות. מוצגים רק חומרים שהתצוגה יודעת לייצג נאמנה.
 */
export const MATERIAL_CATEGORY_TO_SURFACE: Partial<Record<MaterialCategory, MaterialSurface>> = {
  FLOOR: "interiorFloor",
  WALL: "wall",
  COUNTERTOP: "countertop",
  CABINET_FRONT: "kitchenFront",
  DOOR: "doorLeaf",
  OUTDOOR: "outdoorFloor",
};

/** שדות ה-`MaterialDefinition` שההדמיה צורכת */
export interface MaterialDefinitionLike {
  category: MaterialCategory;
  color: string;
  roughness: number;
  metalness: number;
  textureUrl?: string | null;
  productId?: string | null;
  variantId?: string | null;
}

/**
 * ממיר הגדרת חומר של מוצר להקצאת משטח.
 * מחזיר `null` כאשר הקטגוריה אינה ניתנת לייצוג נאמן בתצוגה.
 */
export function toMaterialAssignment(
  material: MaterialDefinitionLike,
  sourceLabel: string,
): MaterialAssignment | null {
  const surface = MATERIAL_CATEGORY_TO_SURFACE[material.category];
  if (!surface) return null;

  return {
    surface,
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    textureUrl: material.textureUrl ?? null,
    sourceLabel,
    productId: material.productId ?? null,
    variantId: material.variantId ?? null,
  };
}
