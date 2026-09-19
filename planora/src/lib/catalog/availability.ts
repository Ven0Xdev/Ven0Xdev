/**
 * שער הבקרה של מערכת התצורה.
 *
 * Planora אינה מערכת עיצוב חופשית. מוצר מוצג לדייר אך ורק אם הוא משויך
 * במפורש לפרויקט, זמין, ומתאים לטיפוס הדירה. מוצר שאינו עומד בתנאים
 * אינו מוצג כלל — לא כאפשרות מנוטרלת ולא כ"בקרוב".
 */

import type { SupplierCategory } from "@prisma/client";

export type ProductEligibility = "INCLUDED" | "UPGRADE" | "NEEDS_REVIEW" | "UNAVAILABLE";

export interface AvailabilityRecord {
  available: boolean;
  includedInStandard: boolean;
  upgradePrice: number;
  requiresApproval: boolean;
  requiresConsultant: boolean;
  minimumRooms: number | null;
  maximumQuantity: number | null;
}

export interface ApartmentContext {
  /** מספר החדרים של טיפוס הדירה */
  rooms: number | null;
}

export interface EligibilityResult {
  eligibility: ProductEligibility;
  /** מחיר השדרוג לדייר. 0 כאשר המוצר כלול בסטנדרט. */
  price: number;
  requiresApproval: boolean;
  requiresConsultant: boolean;
  maximumQuantity: number | null;
  /** הסבר בעברית — מוצג לדייר רק כאשר נדרשת בדיקה */
  reason: string | null;
}

const UNAVAILABLE: EligibilityResult = {
  eligibility: "UNAVAILABLE",
  price: 0,
  requiresApproval: false,
  requiresConsultant: false,
  maximumQuantity: null,
  reason: null,
};

/**
 * קובע האם מוצר זמין לדירה מסוימת ובאיזה מעמד.
 * פונקציה טהורה — אותו קלט תמיד מחזיר אותה תוצאה.
 */
export function evaluateProductAvailability(
  availability: AvailabilityRecord | null | undefined,
  apartment: ApartmentContext,
): EligibilityResult {
  // מוצר שלא שויך לפרויקט אינו קיים מבחינת הדייר
  if (!availability) return UNAVAILABLE;
  if (!availability.available) return UNAVAILABLE;

  // מגבלת טיפוס דירה
  if (
    availability.minimumRooms !== null &&
    (apartment.rooms === null || apartment.rooms < availability.minimumRooms)
  ) {
    return UNAVAILABLE;
  }

  const needsReview = availability.requiresApproval || availability.requiresConsultant;

  if (availability.includedInStandard) {
    return {
      eligibility: "INCLUDED",
      price: 0,
      requiresApproval: availability.requiresApproval,
      requiresConsultant: availability.requiresConsultant,
      maximumQuantity: availability.maximumQuantity,
      reason: null,
    };
  }

  return {
    eligibility: needsReview ? "NEEDS_REVIEW" : "UPGRADE",
    price: Math.max(0, availability.upgradePrice),
    requiresApproval: availability.requiresApproval,
    requiresConsultant: availability.requiresConsultant,
    maximumQuantity: availability.maximumQuantity,
    reason: needsReview
      ? availability.requiresConsultant
        ? "בחירה זו מועברת לבדיקת יועץ מקצועי לפני אישור."
        : "בחירה זו מועברת לאישור מנהלת שינויי הדיירים."
      : null,
  };
}

export function isSelectable(result: EligibilityResult): boolean {
  return result.eligibility !== "UNAVAILABLE";
}

/** מחיר הבחירה בפועל, כולל תוספת הווריאנט */
export function selectionPrice(
  result: EligibilityResult,
  variantPriceDelta = 0,
  quantity = 1,
): number {
  if (result.eligibility === "UNAVAILABLE") return 0;
  const unit = result.price + Math.max(0, variantPriceDelta);
  return Math.round(unit * quantity * 100) / 100;
}

/** אימות כמות מול המגבלה שהוגדרה בפרויקט */
export function isQuantityAllowed(result: EligibilityResult, quantity: number): boolean {
  if (quantity <= 0) return false;
  if (result.maximumQuantity === null) return true;
  return quantity <= result.maximumQuantity;
}

/** סדר הצגת הקטגוריות בממשק הדייר */
export const TENANT_CATEGORY_ORDER: SupplierCategory[] = [
  "KITCHEN",
  "FLOORING",
  "SANITARY",
  "DOORS",
  "LIGHTING",
  "OUTDOOR",
  "APPLIANCES",
  "FURNITURE",
  "WINDOWS",
  "HVAC",
  "OTHER",
];
