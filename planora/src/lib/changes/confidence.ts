/**
 * רמת ודאות בזיהוי.
 *
 * חשוב: רמת ודאות בזיהוי אינה אישור מקצועי ואינה מעידה על עמידה בתקן.
 * היא מתארת עד כמה מנוע ההשוואה בטוח שהוא זיהה נכון את ההבדל בין התוכניות.
 */

import type { ChangeCategoryKey, ChangeType } from "@prisma/client";
import { formatNumber } from "@/lib/i18n/format";
import type { StatusTone } from "@/lib/i18n/he";

export type ConfidenceBand = "HIGH" | "VERIFY" | "MANUAL";

export const CONFIDENCE_THRESHOLDS = {
  /** 97% ומעלה */
  high: 0.97,
  /** 85% ומעלה */
  verify: 0.85,
} as const;

export const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  HIGH: "זוהה בוודאות גבוהה",
  VERIFY: "דורש אימות",
  MANUAL: "דורש בדיקה ידנית",
};

export const CONFIDENCE_BAND_TONE: Record<ConfidenceBand, StatusTone> = {
  HIGH: "success",
  VERIFY: "warning",
  MANUAL: "danger",
};

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return "HIGH";
  if (confidence >= CONFIDENCE_THRESHOLDS.verify) return "VERIFY";
  return "MANUAL";
}

export function confidenceLabel(confidence: number): string {
  return CONFIDENCE_BAND_LABELS[confidenceBand(confidence)];
}

/** "98%" / "88.5%" — ללא אפס עשרוני מיותר */
export function confidencePercent(confidence: number): string {
  const value = Math.round(confidence * 1000) / 10;
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}%`;
}

/** "רמת ודאות בזיהוי: 98%" — לעולם לא "Confidence 98%" */
export function confidenceText(confidence: number): string {
  return `רמת ודאות בזיהוי: ${confidencePercent(confidence)}`;
}

/** האם הזיהוי מחייב בדיקה ידנית של אדם לפני המשך התהליך */
export function requiresHumanVerification(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.high;
}

const BASE_BY_TYPE: Record<ChangeType, number> = {
  ADDED: 0.99,
  REMOVED: 0.98,
  MOVED: 0.95,
  MODIFIED: 0.92,
  UNKNOWN: 0.72,
};

/** קטגוריות שבהן ההפרדה בין שכבות התוכנית פחות חד-משמעית */
const HARDER_CATEGORIES: ChangeCategoryKey[] = ["PLUMBING", "SANITARY", "HVAC"];

/**
 * חישוב דטרמיניסטי של רמת הוודאות בזיהוי.
 * אותו קלט תמיד יחזיר אותה תוצאה — אין כאן אקראיות.
 */
export function computeConfidence(input: {
  type: ChangeType;
  categoryKey: ChangeCategoryKey;
  isLinear?: boolean;
  distanceCm?: number;
  override?: number;
}): number {
  if (typeof input.override === "number") {
    return clamp(input.override);
  }

  let value = BASE_BY_TYPE[input.type];

  if (HARDER_CATEGORIES.includes(input.categoryKey)) value -= 0.06;
  if (input.isLinear) value -= 0.02;
  // הזזה קטנה מאוד עשויה להיות סטייה בשרטוט ולא שינוי מכוון
  if (input.type === "MOVED" && (input.distanceCm ?? 0) < 20) value -= 0.1;

  return clamp(value);
}

function clamp(value: number): number {
  return Math.min(0.995, Math.max(0.4, Math.round(value * 1000) / 1000));
}
