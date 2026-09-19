/**
 * ניתוב אוטומטי של בקשות דיירים.
 *
 * הניתוב קובע למי הבקשה מגיעה — לא מה ההחלטה. ההכרעה תמיד אנושית.
 */

import type { ChangeCategoryKey, ConsultantKind, UserRole } from "@prisma/client";

export interface RoutingResult {
  role: UserRole;
  consultantKind: ConsultantKind | null;
  requiresConsultant: boolean;
  explanation: string;
}

const CONSULTANT_BY_CATEGORY: Partial<Record<ChangeCategoryKey, ConsultantKind>> = {
  PLUMBING: "PLUMBING",
  SANITARY: "PLUMBING",
  HVAC: "HVAC",
  ELECTRICAL: "ELECTRICAL",
  WALL: "STRUCTURAL",
};

/**
 * כל בקשה מגיעה קודם למנהלת שינויי הדיירים.
 * קטגוריות מערכתיות מסומנות מראש כדורשות גם אישור יועץ.
 */
export function routeChangeRequest(category: ChangeCategoryKey): RoutingResult {
  const consultantKind = CONSULTANT_BY_CATEGORY[category] ?? null;

  return {
    role: "TENANT_CHANGE_MANAGER",
    consultantKind,
    requiresConsultant: consultantKind !== null,
    explanation: consultantKind
      ? "הבקשה נשלחה למנהלת שינויי הדיירים, ותועבר לאישור יועץ מקצועי לפי הצורך."
      : "הבקשה נשלחה למנהלת שינויי הדיירים לבדיקה.",
  };
}
