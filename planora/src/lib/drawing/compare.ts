/**
 * מנוע השוואת תוכניות.
 *
 * ההשוואה היא דטרמיניסטית: אותן שתי גרסאות תמיד יפיקו את אותה רשימת שינויים.
 * המנוע מזהה הבדלים בלבד — הוא אינו מאשר דבר ואינו מחליט אם השינוי אפשרי.
 */

import type { ChangeType } from "@prisma/client";
import { computeConfidence } from "@/lib/changes/confidence";
import { describeChange } from "@/lib/changes/describe";
import { center } from "./geometry";
import {
  COUNTABLE_ELEMENTS,
  ELEMENT_CATEGORY,
  ELEMENT_LABELS,
  ELEMENT_UNIT,
  MEASURED_ELEMENTS,
} from "./types";
import type { DetectedChange, DrawingDocument, DrawingElement, ElementType } from "./types";

/** מתחת לסף הזה ההפרש נחשב לסטיית שרטוט ולא לשינוי */
const MOVE_THRESHOLD_CM = 5;

/** אלמנטים שאינם נספרים כשינוי בפני עצמם */
const IGNORED_TYPES: ElementType[] = ["ROOM"];

function isLinear(type: ElementType): boolean {
  return MEASURED_ELEMENTS.includes(type);
}

function quantityOf(element: DrawingElement): { quantity: number; unit: string } {
  if (isLinear(element.type)) {
    const lengthM =
      (element.metadata?.lengthM as number | undefined) ??
      Math.max(element.width, element.height) / 100;
    return { quantity: Math.round(lengthM * 100) / 100, unit: "METER" };
  }
  return { quantity: 1, unit: ELEMENT_UNIT[element.type] };
}

function geometryChanged(a: DrawingElement, b: DrawingElement): boolean {
  return (
    Math.abs(a.width - b.width) > 1 ||
    Math.abs(a.height - b.height) > 1 ||
    Math.abs(a.rotation - b.rotation) > 0.5
  );
}

function metadataChanged(a: DrawingElement, b: DrawingElement): boolean {
  const keys = ["material", "label", "structural", "tag"] as const;
  return keys.some((key) => a.metadata?.[key] !== b.metadata?.[key]);
}

/**
 * משווה שתי תוכניות ומחזיר את רשימת ההבדלים.
 * ההתאמה בין אלמנטים נעשית לפי המזהה היציב שלהם בתוכנית.
 */
export function comparePlans(base: DrawingDocument, target: DrawingDocument): DetectedChange[] {
  const baseElements = new Map(
    base.elements.filter((e) => !IGNORED_TYPES.includes(e.type)).map((e) => [e.id, e]),
  );
  const targetElements = new Map(
    target.elements.filter((e) => !IGNORED_TYPES.includes(e.type)).map((e) => [e.id, e]),
  );

  const changes: DetectedChange[] = [];

  // אלמנטים שנוספו או השתנו
  for (const [id, after] of targetElements) {
    const before = baseElements.get(id);

    if (!before) {
      changes.push(buildChange("ADDED", after, { after }));
      continue;
    }

    const beforeCenter = center(before);
    const afterCenter = center(after);
    const distanceCm = Math.round(
      Math.hypot(beforeCenter.x - afterCenter.x, beforeCenter.y - afterCenter.y),
    );

    if (distanceCm >= MOVE_THRESHOLD_CM) {
      changes.push(buildChange("MOVED", after, { before, after, distanceCm }));
      continue;
    }

    if (geometryChanged(before, after) || metadataChanged(before, after)) {
      changes.push(buildChange("MODIFIED", after, { before, after }));
    }
  }

  // אלמנטים שבוטלו
  for (const [id, before] of baseElements) {
    if (!targetElements.has(id)) {
      changes.push(buildChange("REMOVED", before, { before }));
    }
  }

  return changes.sort(sortChanges);
}

function buildChange(
  type: ChangeType,
  element: DrawingElement,
  context: { before?: DrawingElement; after?: DrawingElement; distanceCm?: number },
): DetectedChange {
  const categoryKey = ELEMENT_CATEGORY[element.type];
  const { quantity, unit } = quantityOf(element);
  const lengthM = isLinear(element.type) ? quantity : undefined;

  const confidence = computeConfidence({
    type,
    categoryKey,
    isLinear: isLinear(element.type),
    distanceCm: context.distanceCm,
    override: (context.after ?? context.before)?.metadata?.detectionConfidence as
      | number
      | undefined,
  });

  return {
    elementId: element.id,
    elementType: element.type,
    type,
    categoryKey,
    confidence,
    roomLabel: element.metadata?.room as string | undefined,
    description: describeChange({
      type,
      elementType: element.type,
      element,
      distanceCm: context.distanceCm,
      lengthM,
    }),
    quantity,
    unit,
    before: context.before,
    after: context.after,
    distanceCm: context.distanceCm,
  };
}

const TYPE_ORDER: Record<ChangeType, number> = {
  ADDED: 0,
  MOVED: 1,
  REMOVED: 2,
  MODIFIED: 3,
  UNKNOWN: 4,
};

function sortChanges(a: DetectedChange, b: DetectedChange): number {
  const byCategory = a.categoryKey.localeCompare(b.categoryKey);
  if (byCategory !== 0) return byCategory;
  const byType = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  if (byType !== 0) return byType;
  return a.elementId.localeCompare(b.elementId, "en", { numeric: true });
}

// ---------------------------------------------------------------------------
// השוואת כמויות: סטנדרט מול שינויים
// ---------------------------------------------------------------------------

export interface QuantityRow {
  elementType: ElementType;
  label: string;
  unit: string;
  standard: number;
  modified: number;
  difference: number;
}

/** סופר כמויות לכל סוג אלמנט בשתי התוכניות ומחזיר את ההפרש */
export function compareQuantities(
  base: DrawingDocument,
  target: DrawingDocument,
): QuantityRow[] {
  const types: ElementType[] = [...COUNTABLE_ELEMENTS, ...MEASURED_ELEMENTS];
  const rows: QuantityRow[] = [];

  for (const type of types) {
    const standard = measure(base, type);
    const modified = measure(target, type);
    if (standard === 0 && modified === 0) continue;

    rows.push({
      elementType: type,
      label: pluralLabelFor(type),
      unit: isLinear(type) ? "METER" : ELEMENT_UNIT[type],
      standard: round(standard),
      modified: round(modified),
      difference: round(modified - standard),
    });
  }

  return rows;
}

function measure(document: DrawingDocument, type: ElementType): number {
  const elements = document.elements.filter((element) => element.type === type);
  if (isLinear(type)) {
    return elements.reduce((total, element) => {
      const lengthM =
        (element.metadata?.lengthM as number | undefined) ??
        Math.max(element.width, element.height) / 100;
      return total + lengthM;
    }, 0);
  }
  return elements.length;
}

const PLURAL_LABELS: Partial<Record<ElementType, string>> = {
  OUTLET: "שקעים",
  SWITCH: "מפסקים",
  LIGHT: "נקודות תאורה",
  WATER_POINT: "נקודות מים",
  DRAIN: "נקודות ביוב",
  SANITARY: "קבועות סניטריות",
  HVAC: "מפזרי מיזוג",
  COMMUNICATION: "נקודות תקשורת",
  DOOR: "דלתות",
  WINDOW: "חלונות",
  SLIDING_DOOR: "דלתות הזזה",
  WALL: "קירות",
  PARTITION: "מחיצות",
};

function pluralLabelFor(type: ElementType): string {
  return PLURAL_LABELS[type] ?? ELEMENT_LABELS[type].label;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
