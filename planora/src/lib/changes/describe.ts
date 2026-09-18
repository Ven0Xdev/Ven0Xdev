/**
 * ניסוח שינויים בעברית.
 * המשתמש לעולם לא רואה "ADDED OUTLET" אלא "התווסף שקע".
 */

import type { ChangeType } from "@prisma/client";
import { CHANGE_CATEGORY_LABELS } from "@/lib/i18n/he";
import { ELEMENT_CATEGORY, ELEMENT_LABELS } from "@/lib/drawing/types";
import type { DrawingElement, ElementType, Gender } from "@/lib/drawing/types";
import { formatNumber } from "@/lib/i18n/format";

interface Subject {
  label: string;
  gender: Gender;
}

export function subjectOf(elementType: ElementType, element?: DrawingElement): Subject {
  const fallback = ELEMENT_LABELS[elementType];
  return {
    label: (element?.metadata?.label as string | undefined) ?? fallback.label,
    gender: (element?.metadata?.gender as Gender | undefined) ?? fallback.gender,
  };
}

/**
 * מחזיר תיאור קצר וברור בעברית לשינוי שזוהה.
 * דוגמאות: "התווסף שקע", "קיר בוטל", "אסלה הוזזה 70 ס\"מ",
 * "בוצע שינוי באינסטלציה".
 */
export function describeChange(input: {
  type: ChangeType;
  elementType: ElementType;
  element?: DrawingElement;
  distanceCm?: number;
  lengthM?: number;
}): string {
  const { label, gender } = subjectOf(input.elementType, input.element);
  const isFeminine = gender === "f";

  switch (input.type) {
    case "ADDED": {
      const verb = isFeminine ? "התווספה" : "התווסף";
      const suffix = input.lengthM ? ` באורך ${formatNumber(input.lengthM, 1)} מ'` : "";
      return `${verb} ${label}${suffix}`;
    }
    case "REMOVED": {
      const verb = isFeminine ? "בוטלה" : "בוטל";
      const suffix = input.lengthM ? ` באורך ${formatNumber(input.lengthM, 1)} מ'` : "";
      return `${label} ${verb}${suffix}`;
    }
    case "MOVED": {
      const verb = isFeminine ? "הוזזה" : "הוזז";
      const suffix = input.distanceCm ? ` ${formatNumber(input.distanceCm, 0)} ס"מ` : "";
      return `${label} ${verb}${suffix}`;
    }
    case "MODIFIED": {
      const category = CHANGE_CATEGORY_LABELS[ELEMENT_CATEGORY[input.elementType]];
      return `בוצע שינוי ב${category}`;
    }
    case "UNKNOWN":
    default:
      return `זוהה הבדל ב${label} שדורש בדיקה ידנית`;
  }
}

/** ניסוח קצר לשימוש בכותרות ורשימות: "7 שקעים נוספו" */
export function describeGroup(
  type: ChangeType,
  elementType: ElementType,
  count: number,
): string {
  const { label, gender } = subjectOf(elementType);
  const isFeminine = gender === "f";
  const plural = pluralizeLabel(label, count);

  switch (type) {
    case "ADDED":
      return `${count} ${plural} ${isFeminine ? "נוספו" : "נוספו"}`;
    case "REMOVED":
      return `${count} ${plural} ${isFeminine ? "בוטלו" : "בוטלו"}`;
    case "MOVED":
      return `${count} ${plural} ${isFeminine ? "הוזזו" : "הוזזו"}`;
    case "MODIFIED":
      return `${count} ${plural} שונו`;
    default:
      return `${count} ${plural} דורשים בדיקה`;
  }
}

const IRREGULAR_PLURALS: Record<string, string> = {
  "שקע": "שקעים",
  "מפסק": "מפסקים",
  "קיר": "קירות",
  "מחיצה": "מחיצות",
  "דלת": "דלתות",
  "חלון": "חלונות",
  "נקודת תאורה": "נקודות תאורה",
  "נקודת מים": "נקודות מים",
  "נקודת ביוב": "נקודות ביוב",
  "נקודת תקשורת": "נקודות תקשורת",
  "מפזר מיזוג": "מפזרי מיזוג",
  "ארון מטבח": "ארונות מטבח",
  "קבועה סניטרית": "קבועות סניטריות",
  "מעקה": "מעקות",
  "אסלה": "אסלות",
  "אמבטיה": "אמבטיות",
};

export function pluralizeLabel(label: string, count: number): string {
  if (count === 1) return label;
  return IRREGULAR_PLURALS[label] ?? label;
}
