import type { RuleDefinition } from "./types";
import { CONFIDENCE_THRESHOLDS } from "@/lib/changes/confidence";

/**
 * כללי המערכת. הם קיימים בכל ארגון ואינם ניתנים למחיקה מתוך הפרויקט.
 * כל כלל מנוסח כך שהוא מפנה לבדיקה אנושית — לא מאשר ולא פוסל.
 */
export const SYSTEM_RULES: RuleDefinition[] = [
  {
    key: "SYS_PLUMBING_MOVED",
    name: "הזזת נקודת אינסטלציה",
    description: "הזזה של נקודת אינסטלציה דורשת אישור יועץ אינסטלציה לפני המשך התהליך.",
    condition: { categoryKey: ["PLUMBING", "SANITARY"], changeType: ["MOVED", "REMOVED"] },
    effect: "REQUIRE_CONSULTANT",
    consultantKind: "PLUMBING",
    severity: "WARNING",
    isSystem: true,
  },
  {
    key: "SYS_HVAC_ANY",
    name: "שינוי במערכת מיזוג",
    description: "כל שינוי במערכת המיזוג דורש אישור יועץ מיזוג.",
    condition: { categoryKey: "HVAC" },
    effect: "REQUIRE_CONSULTANT",
    consultantKind: "HVAC",
    severity: "WARNING",
    isSystem: true,
  },
  {
    key: "SYS_STRUCTURAL_BLOCK",
    name: "שינוי באלמנט קונסטרוקטיבי",
    description:
      "זוהה שינוי באלמנט קונסטרוקטיבי. לא ניתן להמשיך בתהליך ללא אישור יועץ קונסטרוקציה.",
    condition: { structural: true },
    effect: "BLOCK_AUTOMATIC_WORKFLOW",
    consultantKind: "STRUCTURAL",
    severity: "BLOCKING",
    isSystem: true,
  },
  {
    key: "SYS_STRUCTURAL_CONSULTANT",
    name: "אישור יועץ קונסטרוקציה",
    description: "שינוי באלמנט קונסטרוקטיבי מחייב אישור יועץ קונסטרוקציה.",
    condition: { structural: true },
    effect: "REQUIRE_CONSULTANT",
    consultantKind: "STRUCTURAL",
    severity: "BLOCKING",
    isSystem: true,
  },
  {
    key: "SYS_LOW_CONFIDENCE",
    name: "רמת ודאות נמוכה בזיהוי",
    description: "רמת הוודאות בזיהוי אינה מספיקה. נדרשת בדיקה ידנית של התוכנית.",
    condition: { confidenceBelow: CONFIDENCE_THRESHOLDS.verify },
    effect: "REQUIRE_MANAGER_REVIEW",
    severity: "WARNING",
    isSystem: true,
  },
  {
    key: "SYS_WALL_REMOVED",
    name: "ביטול קיר או מחיצה",
    description: "ביטול קיר דורש בדיקה של מנהלת שינויי הדיירים מול תוכנית הסטנדרט.",
    condition: { categoryKey: "WALL", changeType: "REMOVED" },
    effect: "REQUIRE_MANAGER_REVIEW",
    severity: "WARNING",
    isSystem: true,
  },
  {
    key: "SYS_UNKNOWN_DETECTION",
    name: "זיהוי לא ודאי",
    description: "לא ניתן לקבוע אוטומטית את סוג השינוי. נדרשת בדיקה ידנית.",
    condition: { changeType: "UNKNOWN" },
    effect: "REQUIRE_MANAGER_REVIEW",
    severity: "WARNING",
    isSystem: true,
  },
];
