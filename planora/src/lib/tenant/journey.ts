/**
 * מסע הדייר — שמונה השלבים שהדייר רואה.
 *
 * הדייר לעולם אינו רואה שם Enum פנימי. הוא רואה שלב, מצב, ומה נדרש ממנו
 * עכשיו. הלוגיקה טהורה וניתנת לבדיקה.
 */

import type { ApartmentStatus, PaymentStatus } from "@prisma/client";

export const JOURNEY_STAGES = [
  { key: "STANDARD_PLAN", label: "תוכנית סטנדרט" },
  { key: "SELECTIONS", label: "בחירת שינויים" },
  { key: "PROFESSIONAL_REVIEW", label: "בדיקה מקצועית" },
  { key: "CONSULTANT", label: "אישור יועץ" },
  { key: "PRICING", label: "תמחור" },
  { key: "TENANT_APPROVAL", label: "אישור דייר" },
  { key: "PAYMENT", label: "תשלום" },
  { key: "EXECUTION", label: "מאושר לביצוע" },
] as const;

export type JourneyStageKey = (typeof JOURNEY_STAGES)[number]["key"];
export type StageState = "DONE" | "IN_PROGRESS" | "PENDING";

export const STAGE_STATE_LABELS: Record<StageState, string> = {
  DONE: "הושלם",
  IN_PROGRESS: "בתהליך",
  PENDING: "טרם התחיל",
};

/** השלב שבו נמצאת הדירה, לפי הסטטוס שלה */
const STAGE_BY_STATUS: Record<ApartmentStatus, number> = {
  STANDARD: 1,
  CHANGES_IN_PROGRESS: 1,
  AWAITING_REVIEW: 2,
  NEEDS_CORRECTION: 2,
  AWAITING_CONSULTANT: 3,
  AWAITING_PRICING: 4,
  AWAITING_TENANT_APPROVAL: 5,
  AWAITING_PAYMENT: 6,
  PAID: 7,
  APPROVED_FOR_EXECUTION: 7,
};

export interface JourneyStage {
  key: JourneyStageKey;
  label: string;
  state: StageState;
  index: number;
}

export interface NextAction {
  /** האם הכדור נמצא אצל הדייר */
  isTenantTurn: boolean;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}

export interface JourneyResult {
  stages: JourneyStage[];
  currentIndex: number;
  currentLabel: string;
  /** אחוז התקדמות, 0..100 */
  percent: number;
  stepText: string;
  nextAction: NextAction;
}

export interface JourneyInput {
  status: ApartmentStatus;
  paymentStatus?: PaymentStatus;
  /** האם הדייר כבר שלח בחירות לבדיקה */
  hasSubmittedSelections?: boolean;
  /** האם יש הצעת מחיר שממתינה לאישור הדייר */
  hasPricingAwaitingApproval?: boolean;
  openChangeRequests?: number;
  changesWindowClosed?: boolean;
}

export function computeJourney(input: JourneyInput): JourneyResult {
  const currentIndex = STAGE_BY_STATUS[input.status];
  const isComplete = input.status === "APPROVED_FOR_EXECUTION";

  const stages: JourneyStage[] = JOURNEY_STAGES.map((stage, index) => {
    let state: StageState;
    if (isComplete) {
      state = "DONE";
    } else if (index < currentIndex) {
      state = "DONE";
    } else if (index === currentIndex) {
      state = "IN_PROGRESS";
    } else {
      state = "PENDING";
    }
    return { key: stage.key, label: stage.label, state, index };
  });

  const completed = stages.filter((stage) => stage.state === "DONE").length;
  const percent = Math.round((completed / JOURNEY_STAGES.length) * 100);

  return {
    stages,
    currentIndex,
    currentLabel: JOURNEY_STAGES[currentIndex].label,
    percent,
    stepText: `שלב ${currentIndex + 1} מתוך ${JOURNEY_STAGES.length}`,
    nextAction: computeNextAction(input),
  };
}

function computeNextAction(input: JourneyInput): NextAction {
  if (input.hasPricingAwaitingApproval || input.status === "AWAITING_TENANT_APPROVAL") {
    return {
      isTenantTurn: true,
      title: "לאשר את הצעת המחיר",
      description: "הצעת המחיר לשינויים שלך מוכנה וממתינה לאישורך.",
      href: "/tenant/pricing",
      linkLabel: "לצפייה בהצעת המחיר",
    };
  }

  if (input.status === "AWAITING_PAYMENT" || input.paymentStatus === "PENDING") {
    return {
      isTenantTurn: true,
      title: "להשלים את התשלום",
      description: "לאחר קליטת התשלום התוכנית עוברת לשלב האחרון לפני ביצוע.",
      href: "/tenant/pricing",
      linkLabel: "לפרטי התשלום",
    };
  }

  if (input.status === "APPROVED_FOR_EXECUTION") {
    return {
      isTenantTurn: false,
      title: "הכול מוכן",
      description: "התוכנית שלך אושרה לביצוע. אין פעולה נוספת שנדרשת ממך.",
    };
  }

  if (input.status === "AWAITING_REVIEW" || input.hasSubmittedSelections) {
    return {
      isTenantTurn: false,
      title: "אין פעולה נדרשת ממך כרגע",
      description: "הבחירות שלך נמצאות בבדיקה מקצועית. נעדכן אותך בסיום.",
    };
  }

  if (input.status === "AWAITING_CONSULTANT") {
    return {
      isTenantTurn: false,
      title: "אין פעולה נדרשת ממך כרגע",
      description: "חלק מהשינויים נמצאים בבדיקת יועץ מקצועי.",
    };
  }

  if (input.status === "AWAITING_PRICING") {
    return {
      isTenantTurn: false,
      title: "אין פעולה נדרשת ממך כרגע",
      description: "השינויים שאושרו נמצאים בתהליך תמחור. הצעת המחיר תישלח אליך.",
    };
  }

  if (input.changesWindowClosed) {
    return {
      isTenantTurn: false,
      title: "תקופת שינויי הדיירים הסתיימה",
      description: "לא ניתן להוסיף בחירות או בקשות חדשות. לשאלות אפשר לפנות לליווי הפרויקט.",
    };
  }

  return {
    isTenantTurn: true,
    title: "לבחור שדרוגים ולשלוח לבדיקה",
    description: "אפשר לעבור על האפשרויות שמתאימות לדירה שלך, לבחור, ולשלוח לבדיקה.",
    href: "/tenant/apartment",
    linkLabel: "מעבר לבחירות",
  };
}

// ---------------------------------------------------------------------------
// חלון שינויי הדיירים
// ---------------------------------------------------------------------------

export interface ChangeWindow {
  isOpen: boolean;
  message: string;
  closeDate: Date | null;
}

export function evaluateChangeWindow(input: {
  openDate?: Date | null;
  closeDate?: Date | null;
  now?: Date;
}): ChangeWindow {
  const now = input.now ?? new Date();
  const closeDate = input.closeDate ?? null;

  if (input.openDate && now < input.openDate) {
    return {
      isOpen: false,
      message: "תקופת שינויי הדיירים טרם נפתחה בפרויקט.",
      closeDate,
    };
  }

  if (closeDate && now > closeDate) {
    return { isOpen: false, message: "תקופת שינויי הדיירים הסתיימה.", closeDate };
  }

  return {
    isOpen: true,
    message: closeDate ? "ניתן לבצע שינויים עד" : "תקופת שינויי הדיירים פתוחה.",
    closeDate,
  };
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  NOT_REQUIRED: "אין תשלום",
  PENDING: "ממתין לתשלום",
  PARTIALLY_PAID: "שולם חלקית",
  PAID: "שולם",
};
