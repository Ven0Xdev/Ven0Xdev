/**
 * חוקי האתחול של מנהל־העל הראשון.
 *
 * המודול הזה טהור בכוונה — אין בו גישה למסד הנתונים ואין בו קריאה למשתני
 * סביבה. כך אפשר לבדוק את כל כללי הבטיחות בלי בסיס נתונים, והוא לעולם אינו
 * נארז לדפדפן יחד עם סוד כלשהו.
 *
 * כלל ברזל: הסוד עצמו אינו נשמר בשום מקום. נשמרת רק טביעת אצבע חד־כיוונית.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** אורך מזערי לסוד האתחול. קצר מזה — נדחה. */
export const MIN_SECRET_LENGTH = 32;
/** אורך מזערי לסיסמת מנהל־על. */
export const MIN_PASSWORD_LENGTH = 12;

export interface ValidationResult {
  valid: boolean;
  problems: string[];
}

function result(problems: string[]): ValidationResult {
  return { valid: problems.length === 0, problems };
}

/**
 * סוד האתחול חייב להיות ארוך ובעל אנטרופיה אמיתית.
 * ספירת תווים ייחודיים חוסמת סודות כמו "aaaa...aaa" שעוברים בדיקת אורך.
 */
export function validateBootstrapSecret(secret: string | undefined | null): ValidationResult {
  const problems: string[] = [];
  if (!secret) {
    problems.push("חסר סוד אתחול (SUPER_ADMIN_BOOTSTRAP_SECRET).");
    return result(problems);
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`סוד האתחול חייב להיות באורך ${MIN_SECRET_LENGTH} תווים לפחות.`);
  }
  if (new Set(secret).size < 12) {
    problems.push("סוד האתחול חוזר על עצמו מדי. יש לייצר סוד אקראי.");
  }
  if (/\s/.test(secret)) {
    problems.push("סוד האתחול אינו יכול להכיל רווחים.");
  }
  return result(problems);
}

/** סיסמת מנהל־על — אורך ומגוון תווים. הגיבוב עצמו נעשה במנגנון הייצור הקיים. */
export function validateAdminPassword(password: string | undefined | null): ValidationResult {
  const problems: string[] = [];
  if (!password) {
    problems.push("חסרה סיסמה (SUPER_ADMIN_PASSWORD).");
    return result(problems);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`הסיסמה חייבת להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות.`);
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes < 3) {
    problems.push("הסיסמה חייבת לכלול לפחות שלושה סוגי תווים: אותיות קטנות, גדולות, ספרות וסימנים.");
  }
  return result(problems);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateAdminEmail(email: string | undefined | null): ValidationResult {
  const problems: string[] = [];
  if (!email) {
    problems.push("חסרה כתובת דואר אלקטרוני (SUPER_ADMIN_EMAIL).");
    return result(problems);
  }
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    problems.push("כתובת הדואר האלקטרוני אינה תקינה.");
  }
  return result(problems);
}

export function validateAdminName(name: string | undefined | null): ValidationResult {
  const problems: string[] = [];
  const trimmed = name?.trim() ?? "";
  if (trimmed.length < 2) {
    problems.push("חסר שם מלא (SUPER_ADMIN_NAME).");
  }
  return result(problems);
}

/**
 * טביעת אצבע חד־כיוונית של סוד האתחול, לרישום הביקורת.
 * אי אפשר לשחזר ממנה את הסוד, ואפשר להוכיח באמצעותה באיזה סוד נעשה שימוש.
 */
export function secretFingerprint(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** השוואה עמידה בפני מדידת זמן. אורכים שונים מוחזרים כ-false בלי להדליף. */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(secretFingerprint(a), "hex");
  const right = Buffer.from(secretFingerprint(b), "hex");
  return timingSafeEqual(left, right);
}

export type BootstrapDecision =
  | { kind: "ALLOWED" }
  | { kind: "BLOCKED_SUPER_ADMIN_EXISTS"; message: string }
  | { kind: "BLOCKED_ALREADY_BOOTSTRAPPED"; message: string }
  | { kind: "BLOCKED_INVALID_INPUT"; message: string; problems: string[] };

export interface BootstrapState {
  /** מספר מנהלי־על קיימים — לפי User.isSuperAdmin או חברות בתפקיד SUPER_ADMIN */
  superAdminCount: number;
  /** האם כבר בוצע אתחול (קיימת שורת ביקורת) */
  alreadyBootstrapped: boolean;
}

export interface BootstrapInput {
  email?: string | null;
  name?: string | null;
  password?: string | null;
  secret?: string | null;
}

/**
 * ההחלטה היחידה שקובעת אם מותר ליצור מנהל־על.
 * מופעלת פעמיים: לפני הטרנזקציה, ושוב בתוכה — כדי לסגור מירוץ.
 */
export function decideBootstrap(
  state: BootstrapState,
  input: BootstrapInput,
): BootstrapDecision {
  if (state.alreadyBootstrapped) {
    return {
      kind: "BLOCKED_ALREADY_BOOTSTRAPPED",
      message: "האתחול כבר בוצע. מנגנון האתחול נעול.",
    };
  }
  if (state.superAdminCount > 0) {
    return {
      kind: "BLOCKED_SUPER_ADMIN_EXISTS",
      message: "SUPER_ADMIN already exists — אתחול נוסף אינו אפשרי.",
    };
  }

  const problems = [
    ...validateBootstrapSecret(input.secret).problems,
    ...validateAdminEmail(input.email).problems,
    ...validateAdminName(input.name).problems,
    ...validateAdminPassword(input.password).problems,
  ];

  if (problems.length > 0) {
    return { kind: "BLOCKED_INVALID_INPUT", message: "קלט אינו תקין.", problems };
  }

  return { kind: "ALLOWED" };
}

/**
 * מנקה טקסט לפני כתיבה ליומן או להודעת שגיאה.
 * ערכים רגישים לעולם אינם מגיעים לפלט — הפונקציה מחליפה אותם בסימון קבוע.
 */
export function redactSecrets(text: string, secrets: (string | undefined | null)[]): string {
  let output = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      output = output.split(secret).join("[redacted]");
    }
  }
  return output;
}
