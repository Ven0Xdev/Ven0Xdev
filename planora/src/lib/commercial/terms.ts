/**
 * המודל המסחרי של נותן השירות.
 *
 * מידע פנימי בלבד. הוא לעולם אינו מוצג לדייר — לא בפירוט המחיר,
 * לא בגיליון התמחור ולא בהתראות. הגישה אליו מוגנת ביכולת "commercial:view".
 */

import type { ChangeCategoryKey, SupplierCategory } from "@prisma/client";

export interface CommercialTerms {
  setupFee: number;
  perApartmentFee: number;
  majorChangesCommissionPercent: number;
  majorChangeThreshold: number;
  currency: string;
}

/** קטגוריות שנחשבות שינוי משמעותי ללא תלות בסכום */
export const ALWAYS_MAJOR_CHANGE_CATEGORIES: ChangeCategoryKey[] = [
  "PLUMBING",
  "WALL",
  "HVAC",
];

export const ALWAYS_MAJOR_SUPPLIER_CATEGORIES: SupplierCategory[] = ["KITCHEN"];

export interface MajorChangeInput {
  value: number;
  threshold: number;
  changeCategory?: ChangeCategoryKey | null;
  supplierCategory?: SupplierCategory | null;
  /** שינוי שנקבע ידנית כמשמעותי על ידי גורם מקצועי */
  forced?: boolean;
}

export interface MajorChangeResult {
  isMajor: boolean;
  reason: string | null;
  value: number;
}

/**
 * קובע האם שינוי נחשב משמעותי.
 * דטרמיניסטי, ומסביר את עצמו — ההסבר נשמר ב-ChangeItem לצורכי ביקורת.
 */
export function evaluateMajorChange(input: MajorChangeInput): MajorChangeResult {
  const value = Math.max(0, input.value);

  if (input.forced) {
    return { isMajor: true, reason: "סומן כשינוי משמעותי על ידי גורם מקצועי", value };
  }

  if (
    input.changeCategory &&
    ALWAYS_MAJOR_CHANGE_CATEGORIES.includes(input.changeCategory)
  ) {
    return { isMajor: true, reason: "שינוי במערכת שדורשת התערבות מקצועית", value };
  }

  if (
    input.supplierCategory &&
    ALWAYS_MAJOR_SUPPLIER_CATEGORIES.includes(input.supplierCategory) &&
    value > 0
  ) {
    return { isMajor: true, reason: "שדרוג מטבח", value };
  }

  if (input.threshold > 0 && value >= input.threshold) {
    return { isMajor: true, reason: `היקף השינוי עולה על סף השינוי המשמעותי`, value };
  }

  return { isMajor: false, reason: null, value };
}

export interface CommissionSummary {
  majorChangesValue: number;
  commissionPercent: number;
  commission: number;
  setupFee: number;
  perApartmentFee: number;
  apartmentCount: number;
  fixedFeesTotal: number;
  total: number;
}

/** סיכום ההכנסה של נותן השירות מפרויקט. מידע פנימי. */
export function computeCommercialSummary(input: {
  terms: CommercialTerms;
  majorChangesValue: number;
  apartmentCount: number;
}): CommissionSummary {
  const commission = round(
    (Math.max(0, input.majorChangesValue) * input.terms.majorChangesCommissionPercent) / 100,
  );
  const perApartment = round(input.terms.perApartmentFee * Math.max(0, input.apartmentCount));
  const fixedFeesTotal = round(input.terms.setupFee + perApartment);

  return {
    majorChangesValue: round(input.majorChangesValue),
    commissionPercent: input.terms.majorChangesCommissionPercent,
    commission,
    setupFee: input.terms.setupFee,
    perApartmentFee: input.terms.perApartmentFee,
    apartmentCount: input.apartmentCount,
    fixedFeesTotal,
    total: round(fixedFeesTotal + commission),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
