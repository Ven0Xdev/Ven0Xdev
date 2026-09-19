/**
 * מיזוג מפרט הסטנדרט עם בחירות הדייר.
 *
 * כלל מחייב: חומר נכנס לסצנה רק אם הוא מגיע ממוצר אמיתי שאושר לפרויקט.
 * מה שאין לו מוצר — נשאר מפרט הסטנדרט.
 */

import { FAMILY_DEFAULTS, STANDARD_SURFACES, type MaterialSurface } from "./material-library";
import type { MaterialAssignment, ResolvedMaterial } from "./types";

/** ממזג הקצאה אחת עם ברירות המחדל של משפחת החומר שלה */
export function resolveAssignment(assignment: MaterialAssignment): ResolvedMaterial {
  const standard = STANDARD_SURFACES[assignment.surface];
  const family = assignment.family ?? standard.family;
  const familyDefaults = FAMILY_DEFAULTS[family];

  // המרקם מגיע מהספק אם הוגדר, אחרת מברירת המחדל של המשפחה. גוון המרקם
  // נגזר מהגוון הנבחר, כדי שעורקי השיש ייראו נכון גם בגוון כהה.
  const texture = assignment.texture ?? familyDefaults.texture;

  return {
    ...familyDefaults,
    family,
    baseColor: assignment.color,
    roughness: assignment.roughness,
    metalness: assignment.metalness,
    texture,
    textureUrl: assignment.textureUrl ?? null,
    sourceLabel: assignment.sourceLabel,
  };
}

/**
 * מחזיר את החומר לכל משטח בסצנה.
 * משטח ללא בחירה מקבל את מפרט הסטנדרט של הפרויקט.
 */
export function resolveSurfaces(
  assignments: MaterialAssignment[],
): Record<MaterialSurface, ResolvedMaterial> {
  const resolved = { ...STANDARD_SURFACES } as Record<MaterialSurface, ResolvedMaterial>;

  for (const assignment of assignments) {
    resolved[assignment.surface] = resolveAssignment(assignment);
  }

  return resolved;
}
