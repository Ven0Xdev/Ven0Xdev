/**
 * אתחול מנהל־העל הראשון.
 *
 * זו הדרך היחידה שבה נוצר SUPER_ADMIN ב-OVIAX. אין מסך, אין כפתור, ואין
 * פעולת שרת שמעניקה את התפקיד הזה — ראו src/lib/auth/role-assignment.ts.
 *
 * הפונקציה כאן אינה קוראת משתני סביבה ואינה כותבת ליומן. הסוד מגיע אליה
 * כפרמטר, נשמר כטביעת אצבע בלבד, ואינו מוחזר בשום מצב.
 */

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

import {
  decideBootstrap,
  normalizeEmail,
  secretFingerprint,
  type BootstrapDecision,
} from "@/lib/admin/bootstrap";

/** עלות הגיבוב. אותו מנגנון bcrypt שמשמש את ספק ההתחברות בייצור. */
export const ADMIN_BCRYPT_COST = 12;

export interface BootstrapRequest {
  email: string;
  name: string;
  password: string;
  secret: string;
  /** מאיפה הורצה הפקודה — לרישום הביקורת בלבד */
  performedFrom?: string;
}

export type BootstrapOutcome =
  | {
      kind: "CREATED";
      userId: string;
      email: string;
      role: "SUPER_ADMIN";
      createdAt: Date;
    }
  | { kind: "ALREADY_BOOTSTRAPPED"; message: string; existingEmail?: string }
  | { kind: "SUPER_ADMIN_EXISTS"; message: string; count: number }
  | { kind: "EMAIL_TAKEN"; message: string }
  | { kind: "INVALID_INPUT"; message: string; problems: string[] };

/**
 * ספירת מנהלי־על. התפקיד מיוצג בשתי צורות — הדגל `User.isSuperAdmin` וחברות
 * בארגון בתפקיד SUPER_ADMIN — ולכן נספרים משתמשים ייחודיים ולא שורות, אחרת
 * אותו אדם היה נספר פעמיים.
 */
export async function countSuperAdmins(prisma: PrismaClient): Promise<number> {
  const [flagged, members] = await Promise.all([
    prisma.user.findMany({ where: { isSuperAdmin: true }, select: { id: true } }),
    prisma.organizationMember.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { userId: true },
    }),
  ]);
  const unique = new Set<string>();
  for (const user of flagged) unique.add(user.id);
  for (const member of members) unique.add(member.userId);
  return unique.size;
}

export async function readBootstrapState(prisma: PrismaClient) {
  const [superAdminCount, record] = await Promise.all([
    countSuperAdmins(prisma),
    prisma.adminBootstrap.findUnique({ where: { lock: "singleton" } }),
  ]);
  return { superAdminCount, alreadyBootstrapped: record !== null, record };
}

function fromDecision(decision: BootstrapDecision, existingEmail?: string): BootstrapOutcome | null {
  switch (decision.kind) {
    case "ALLOWED":
      return null;
    case "BLOCKED_ALREADY_BOOTSTRAPPED":
      return { kind: "ALREADY_BOOTSTRAPPED", message: decision.message, existingEmail };
    case "BLOCKED_SUPER_ADMIN_EXISTS":
      return { kind: "SUPER_ADMIN_EXISTS", message: decision.message, count: 1 };
    case "BLOCKED_INVALID_INPUT":
      return { kind: "INVALID_INPUT", message: decision.message, problems: decision.problems };
  }
}

/**
 * מריץ את האתחול. אידמפוטנטי: הרצה שנייה אינה משנה דבר ומחזירה
 * ALREADY_BOOTSTRAPPED או SUPER_ADMIN_EXISTS.
 */
export async function bootstrapFirstSuperAdmin(
  prisma: PrismaClient,
  request: BootstrapRequest,
): Promise<BootstrapOutcome> {
  const email = normalizeEmail(request.email ?? "");
  const name = request.name?.trim() ?? "";

  const state = await readBootstrapState(prisma);
  const early = fromDecision(
    decideBootstrap(state, {
      email,
      name,
      password: request.password,
      secret: request.secret,
    }),
    state.record?.email,
  );
  if (early) return early;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      kind: "EMAIL_TAKEN",
      message:
        "כבר קיים משתמש עם כתובת הדואר הזו. האתחול אינו מעלה חשבון קיים לדרגת מנהל־על — יש לבחור כתובת אחרת.",
    };
  }

  const passwordHash = await bcrypt.hash(request.password, ADMIN_BCRYPT_COST);
  const fingerprint = secretFingerprint(request.secret);

  try {
    const created = await prisma.$transaction(async (tx) => {
      // בדיקה שנייה בתוך הטרנזקציה — סוגרת מירוץ בין שתי הרצות במקביל
      const superAdmins = await tx.user.count({ where: { isSuperAdmin: true } });
      if (superAdmins > 0) return null;

      const user = await tx.user.create({
        data: {
          email,
          name,
          isSuperAdmin: true,
          passwordHash,
          emailVerified: new Date(),
        },
        select: { id: true, email: true, createdAt: true },
      });

      // שורת הביקורת היא גם המנעול: lock ייחודי, ולכן היא נכנסת פעם אחת בלבד
      await tx.adminBootstrap.create({
        data: {
          lock: "singleton",
          userId: user.id,
          email,
          role: "SUPER_ADMIN",
          method: "BOOTSTRAP",
          secretFingerprint: fingerprint,
          performedFrom: request.performedFrom ?? null,
        },
      });

      return user;
    });

    if (!created) {
      return {
        kind: "SUPER_ADMIN_EXISTS",
        message: "SUPER_ADMIN already exists — אתחול נוסף אינו אפשרי.",
        count: 1,
      };
    }

    return {
      kind: "CREATED",
      userId: created.id,
      email: created.email ?? email,
      role: "SUPER_ADMIN",
      createdAt: created.createdAt,
    };
  } catch (error) {
    // הפרת המנעול הייחודי פירושה שהרצה מקבילה הקדימה אותנו
    if (isUniqueViolation(error)) {
      return {
        kind: "ALREADY_BOOTSTRAPPED",
        message: "האתחול כבר בוצע. מנגנון האתחול נעול.",
      };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
