/**
 * מילון עברית לכל ערכי ה-Enum ולכל מונחי המערכת.
 * המשתמש לעולם אינו רואה שם Enum פנימי.
 */

import type {
  ActivityKind,
  ApartmentStatus,
  ApprovalKind,
  ApprovalStatus,
  AssignmentKind,
  AssignmentStatus,
  ChangeCategoryKey,
  ChangeItemStatus,
  ChangeSetStatus,
  ChangeType,
  ConsultantDecision,
  ConsultantKind,
  ConsultantRequestStatus,
  FileKind,
  NotificationKind,
  OrganizationType,
  PlanKind,
  PlanVersionStatus,
  PricingLineSource,
  PricingSheetStatus,
  ProfessionalDecisionKind,
  ProjectStatus,
  ReviewStatus,
  RuleEffect,
  RuleSeverity,
  UserRole,
  VatBehavior,
} from "@prisma/client";

export const APP_NAME = "Planora";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "מנהל מערכת",
  ORGANIZATION_ADMIN: "מנהל ארגון",
  PROJECT_MANAGER: "מנהל פרויקט",
  TENANT_CHANGE_MANAGER: "מנהלת שינויי דיירים",
  TENANT_CHANGE_COORDINATOR: "מתאמת שינויי דיירים",
  ARCHITECT: "אדריכל",
  DESIGNER: "מעצבת",
  BIM_MANAGER: "מנהל BIM",
  HVAC_CONSULTANT: "יועץ מיזוג",
  PLUMBING_CONSULTANT: "יועץ אינסטלציה",
  ELECTRICAL_CONSULTANT: "יועץ חשמל",
  STRUCTURAL_CONSULTANT: "יועץ קונסטרוקציה",
  PRICING_MANAGER: "מנהל תמחור",
  TENANT: "דייר",
  FINANCE: "כספים",
};

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  DEVELOPER: "יזם",
  CONTRACTOR: "קבלן",
  TENANT_CHANGE_SERVICE: "חברת ניהול שינויי דיירים",
  ARCHITECTURE_FIRM: "משרד אדריכלים",
  CONSULTANT_FIRM: "משרד יועצים",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "בתכנון",
  ACTIVE: "פעיל",
  TENANT_CHANGES: "בשלב שינויי דיירים",
  EXECUTION: "בביצוע",
  COMPLETED: "הושלם",
  ARCHIVED: "בארכיון",
};

export const APARTMENT_STATUS_LABELS: Record<ApartmentStatus, string> = {
  STANDARD: "סטנדרט",
  CHANGES_IN_PROGRESS: "בתהליך שינויים",
  AWAITING_REVIEW: "ממתין לבדיקה",
  NEEDS_CORRECTION: "נדרש תיקון",
  AWAITING_CONSULTANT: "ממתין ליועץ",
  AWAITING_PRICING: "ממתין לתמחור",
  AWAITING_TENANT_APPROVAL: "ממתין לאישור דייר",
  AWAITING_PAYMENT: "ממתין לתשלום",
  PAID: "שולם",
  APPROVED_FOR_EXECUTION: "מאושר לביצוע",
};

/** גוון חזותי לכל סטטוס דירה */
export const APARTMENT_STATUS_TONE: Record<ApartmentStatus, StatusTone> = {
  STANDARD: "neutral",
  CHANGES_IN_PROGRESS: "brand",
  AWAITING_REVIEW: "warning",
  NEEDS_CORRECTION: "danger",
  AWAITING_CONSULTANT: "consultant",
  AWAITING_PRICING: "brand",
  AWAITING_TENANT_APPROVAL: "warning",
  AWAITING_PAYMENT: "warning",
  PAID: "success",
  APPROVED_FOR_EXECUTION: "success",
};

export type StatusTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "consultant";

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  STANDARD: "תוכנית סטנדרט",
  MODIFIED: "תוכנית שינויים",
};

export const PLAN_VERSION_STATUS_LABELS: Record<PlanVersionStatus, string> = {
  DRAFT: "טיוטה",
  SUBMITTED: "הוגשה",
  IN_REVIEW: "בבדיקה",
  NEEDS_CORRECTION: "נדרש תיקון",
  APPROVED: "אושרה",
  SUPERSEDED: "הוחלפה בגרסה חדשה",
};

export const PLAN_VERSION_STATUS_TONE: Record<PlanVersionStatus, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "brand",
  IN_REVIEW: "warning",
  NEEDS_CORRECTION: "danger",
  APPROVED: "success",
  SUPERSEDED: "neutral",
};

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  PDF: "PDF",
  DWG: "AutoCAD (DWG)",
  DXF: "DXF",
  RVT: "Revit (RVT)",
  IFC: "IFC",
  IMAGE: "תמונה",
  OTHER: "קובץ",
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  ADDED: "תוספת",
  REMOVED: "ביטול",
  MOVED: "הזזה",
  MODIFIED: "שינוי",
  UNKNOWN: "זיהוי לא ודאי",
};

export const CHANGE_TYPE_TONE: Record<ChangeType, StatusTone> = {
  ADDED: "success",
  REMOVED: "danger",
  MOVED: "warning",
  MODIFIED: "warning",
  UNKNOWN: "consultant",
};

export const CHANGE_CATEGORY_LABELS: Record<ChangeCategoryKey, string> = {
  ELECTRICAL: "חשמל",
  LIGHTING: "תאורה",
  WALL: "קירות",
  DOOR: "דלתות",
  WINDOW: "חלונות",
  PLUMBING: "אינסטלציה",
  HVAC: "מיזוג אוויר",
  KITCHEN: "מטבח",
  SANITARY: "סניטרי",
  COMMUNICATION: "תקשורת",
  OTHER: "אחר",
};

export const CHANGE_ITEM_STATUS_LABELS: Record<ChangeItemStatus, string> = {
  DETECTED: "ממתין לבדיקה",
  CONFIRMED: "הזיהוי אושר",
  DISMISSED: "לא מדובר בשינוי",
  REJECTED: "נדחה",
  AWAITING_CONSULTANT: "ממתין ליועץ",
  CONSULTANT_APPROVED: "אושר על ידי יועץ",
  CONSULTANT_CONDITIONAL: "אושר בתנאים",
  CONSULTANT_REJECTED: "נדחה על ידי יועץ",
  PRICED: "נכלל בתמחור",
};

export const CHANGE_ITEM_STATUS_TONE: Record<ChangeItemStatus, StatusTone> = {
  DETECTED: "warning",
  CONFIRMED: "success",
  DISMISSED: "neutral",
  REJECTED: "danger",
  AWAITING_CONSULTANT: "consultant",
  CONSULTANT_APPROVED: "success",
  CONSULTANT_CONDITIONAL: "warning",
  CONSULTANT_REJECTED: "danger",
  PRICED: "brand",
};

export const CHANGE_SET_STATUS_LABELS: Record<ChangeSetStatus, string> = {
  DRAFT: "טיוטה",
  IN_REVIEW: "בבדיקה",
  REVIEWED: "הבדיקה הושלמה",
  PRICED: "תומחר",
  CLOSED: "סגור",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  OPEN: "ממתינה לבדיקה",
  IN_PROGRESS: "בבדיקה",
  COMPLETED: "הבדיקה הושלמה",
  RETURNED_FOR_CORRECTION: "הוחזרה לתיקון",
};

export const REVIEW_STATUS_TONE: Record<ReviewStatus, StatusTone> = {
  OPEN: "warning",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  RETURNED_FOR_CORRECTION: "danger",
};

export const CONSULTANT_KIND_LABELS: Record<ConsultantKind, string> = {
  PLUMBING: "יועץ אינסטלציה",
  HVAC: "יועץ מיזוג",
  ELECTRICAL: "יועץ חשמל",
  STRUCTURAL: "יועץ קונסטרוקציה",
  ARCHITECT: "אדריכל הפרויקט",
  OTHER: "גורם מקצועי",
};

export const CONSULTANT_REQUEST_STATUS_LABELS: Record<ConsultantRequestStatus, string> = {
  PENDING: "ממתין לתשובה",
  ANSWERED: "התקבלה תשובה",
  CANCELLED: "בוטלה",
};

export const CONSULTANT_REQUEST_STATUS_TONE: Record<ConsultantRequestStatus, StatusTone> = {
  PENDING: "consultant",
  ANSWERED: "success",
  CANCELLED: "neutral",
};

export const CONSULTANT_DECISION_LABELS: Record<ConsultantDecision, string> = {
  APPROVED: "מאושר",
  APPROVED_WITH_CONDITIONS: "מאושר בתנאים",
  REJECTED: "נדחה",
  MORE_INFO_REQUIRED: "נדרש מידע נוסף",
};

export const CONSULTANT_DECISION_TONE: Record<ConsultantDecision, StatusTone> = {
  APPROVED: "success",
  APPROVED_WITH_CONDITIONS: "warning",
  REJECTED: "danger",
  MORE_INFO_REQUIRED: "consultant",
};

export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  MANAGER_REVIEW: "אישור מנהלת שינויי דיירים",
  CONSULTANT: "אישור יועץ",
  PRICING: "אישור תמחור",
  TENANT: "אישור דייר",
  PAYMENT: "אישור תשלום",
  EXECUTION_RELEASE: "שחרור לביצוע",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "ממתין",
  GRANTED: "אושר",
  DECLINED: "נדחה",
};

export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, StatusTone> = {
  PENDING: "warning",
  GRANTED: "success",
  DECLINED: "danger",
};

export const PROFESSIONAL_DECISION_KIND_LABELS: Record<ProfessionalDecisionKind, string> = {
  CHANGE_CONFIRMED: "אישור זיהוי שינוי",
  CHANGE_REJECTED: "דחיית שינוי",
  CHANGE_DISMISSED: "סימון שאינו שינוי",
  CLASSIFICATION_CORRECTED: "תיקון סיווג",
  SENT_TO_CONSULTANT: "העברה ליועץ",
  CONSULTANT_DECISION: "החלטת יועץ",
  PLAN_RETURNED_FOR_CORRECTION: "החזרת תוכנית לתיקון",
  PLAN_APPROVED: "אישור תוכנית",
  PRICING_APPROVED: "אישור תמחור",
  RELEASED_FOR_EXECUTION: "שחרור לביצוע",
};

export const ASSIGNMENT_KIND_LABELS: Record<AssignmentKind, string> = {
  PLAN_REVIEW: "בדיקת תוכנית",
  CORRECTION: "תיקון תוכנית",
  CONSULTANT_REVIEW: "בדיקת יועץ",
  PRICING: "תמחור",
  TENANT_FOLLOW_UP: "מעקב מול דייר",
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  OPEN: "פתוחה",
  IN_PROGRESS: "בטיפול",
  DONE: "הושלמה",
  CANCELLED: "בוטלה",
};

export const ASSIGNMENT_STATUS_TONE: Record<AssignmentStatus, StatusTone> = {
  OPEN: "warning",
  IN_PROGRESS: "brand",
  DONE: "success",
  CANCELLED: "neutral",
};

export const PRICING_LINE_SOURCE_LABELS: Record<PricingLineSource, string> = {
  AUTOMATIC: "אוטומטי",
  MANUAL: "ידני",
  EDITED: "נערך",
};

export const PRICING_SHEET_STATUS_LABELS: Record<PricingSheetStatus, string> = {
  DRAFT: "טיוטה",
  SENT_TO_TENANT: "נשלח לדייר",
  APPROVED_BY_TENANT: "אושר על ידי הדייר",
  PAID: "שולם",
  CANCELLED: "בוטל",
};

export const PRICING_SHEET_STATUS_TONE: Record<PricingSheetStatus, StatusTone> = {
  DRAFT: "neutral",
  SENT_TO_TENANT: "brand",
  APPROVED_BY_TENANT: "success",
  PAID: "success",
  CANCELLED: "neutral",
};

export const VAT_BEHAVIOR_LABELS: Record<VatBehavior, string> = {
  ADD_VAT: "לפני מע\"מ",
  INCLUDED: "כולל מע\"מ",
  EXEMPT: "פטור ממע\"מ",
};

export const RULE_EFFECT_LABELS: Record<RuleEffect, string> = {
  REQUIRE_CONSULTANT: "נדרש אישור יועץ",
  REQUIRE_MANAGER_REVIEW: "נדרשת בדיקת מנהלת שינויי דיירים",
  BLOCK_AUTOMATIC_WORKFLOW: "חסימת המשך אוטומטי",
  FLAG_FOR_ATTENTION: "סימון לתשומת לב",
};

export const RULE_SEVERITY_LABELS: Record<RuleSeverity, string> = {
  INFO: "מידע",
  WARNING: "לתשומת לב",
  BLOCKING: "חוסם",
};

export const RULE_SEVERITY_TONE: Record<RuleSeverity, StatusTone> = {
  INFO: "neutral",
  WARNING: "warning",
  BLOCKING: "danger",
};

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  PLAN_UPLOADED: "הועלתה תוכנית",
  REVIEW_REQUIRED: "נדרשת בדיקה",
  CONSULTANT_ANSWERED: "התקבלה תשובת יועץ",
  CONSULTANT_REQUESTED: "נשלחה בקשה ליועץ",
  CORRECTION_REQUIRED: "נדרש תיקון",
  READY_FOR_PRICING: "מוכן לתמחור",
  PRICING_UPDATED: "התמחור עודכן",
  TENANT_APPROVED: "הדייר אישר",
  PAYMENT_RECEIVED: "התקבל תשלום",
  RELEASED_FOR_EXECUTION: "שוחרר לביצוע",
  ASSIGNMENT: "משימה חדשה",
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  PROJECT_CREATED: "נוצר פרויקט",
  APARTMENT_CREATED: "נוספה דירה",
  PLAN_UPLOADED: "הועלתה תוכנית",
  VERSION_CREATED: "נוצרה גרסה חדשה",
  ANALYSIS_COMPLETED: "הושלמה השוואת תוכניות",
  CHANGE_DETECTED: "זוהה שינוי",
  CHANGE_CONFIRMED: "אושר זיהוי שינוי",
  CHANGE_CORRECTED: "תוקן סיווג שינוי",
  CHANGE_DISMISSED: "סומן שאינו שינוי",
  CHANGE_REJECTED: "נדחה שינוי",
  CONSULTANT_REQUESTED: "הועברה בקשה ליועץ",
  CONSULTANT_ANSWERED: "התקבלה תשובת יועץ",
  REVIEW_COMPLETED: "הושלמה בדיקה",
  CORRECTION_REQUESTED: "התבקש תיקון בתוכנית",
  PRICING_UPDATED: "עודכן תמחור",
  PRICING_SENT: "התמחור נשלח לדייר",
  TENANT_APPROVED: "הדייר אישר",
  PAYMENT_RECEIVED: "התקבל תשלום",
  EXECUTION_RELEASED: "התוכנית אושרה לביצוע",
  RULE_TRIGGERED: "הופעל כלל פרויקט",
  NOTE_ADDED: "נוספה הערה",
};

/** תוויות ניווט ראשיות */
export const NAV_LABELS = {
  dashboard: "לוח בקרה",
  myWork: "העבודה שלי",
  projects: "פרויקטים",
  apartments: "דירות",
  reviews: "בדיקות תוכניות",
  consultants: "אישורי יועצים",
  pricing: "תמחור",
  documents: "מסמכים",
  reports: "דוחות",
  learningCenter: "מרכז למידה",
  settings: "הגדרות",
} as const;

/** לשוניות Workspace של דירה */
export const APARTMENT_TABS = {
  overview: "סקירה",
  plans: "תוכניות",
  changes: "שינויים",
  review: "בדיקה",
  pricing: "תמחור",
  consultants: "יועצים",
  approvals: "אישורים",
  history: "היסטוריה",
} as const;

export const PROJECT_TABS = {
  overview: "סקירה",
  buildings: "בניינים",
  types: "טיפוסי דירות",
  apartments: "דירות",
  team: "צוות",
  rules: "כללי הפרויקט",
  priceBook: "מחירון",
  files: "קבצים",
  reports: "דוחות",
  history: "היסטוריה",
} as const;
