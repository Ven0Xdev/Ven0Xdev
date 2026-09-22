/**
 * יצירה ועדכון של משתמשים ותפקידים.
 *
 * כל נתיב שנוגע בתפקיד עובר כאן, וכאן נאכפים הכללים:
 * SUPER_ADMIN אינו ניתן להענקה, אין מעניקים תפקיד גבוה משלך, ומנהל ארגון
 * נוגע רק בארגון שלו. התפקיד מגיע מהטופס — ולכן הוא נבדק מול המבצע ולא
 * מתקבל כמו שהוא.
 */

import bcrypt from "bcryptjs";
import type { PrismaClient, UserRole } from "@prisma/client";

import { normalizeEmail, validateAdminEmail, validateAdminPassword } from "@/lib/admin/bootstrap";
import { decideRoleAssignment } from "@/lib/auth/role-assignment";

export const MEMBER_BCRYPT_COST = 12;

/** מי מבצע את הפעולה — נקבע בצד השרת מהסשן, לעולם לא מהטופס */
export interface ActorContext {
  userId: string;
  role: UserRole | null;
  isSuperAdmin: boolean;
  organizationIds: string[];
}

export type UserManagementOutcome<T> =
  | { kind: "OK"; value: T }
  | { kind: "DENIED"; message: string; reason: string }
  | { kind: "INVALID"; message: string; problems: string[] }
  | { kind: "CONFLICT"; message: string };

export interface CreateMemberInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  organizationId: string;
  jobTitle?: string | null;
}

/**
 * יוצר משתמש ומצרף אותו לארגון בתפקיד מבוקש.
 * לעולם אינו קובע isSuperAdmin — השדה הזה אינו נגיש מכאן בכלל.
 */
export async function createOrganizationMember(
  prisma: PrismaClient,
  actor: ActorContext,
  input: CreateMemberInput,
): Promise<UserManagementOutcome<{ userId: string; role: UserRole }>> {
  const decision = decideRoleAssignment({
    actorRole: actor.role,
    targetRole: input.role,
    actorIsSuperAdmin: actor.isSuperAdmin,
    actorOrganizationIds: actor.organizationIds,
    targetOrganizationId: input.organizationId,
  });
  if (!decision.allowed) {
    return { kind: "DENIED", message: decision.message, reason: decision.reason };
  }

  const problems = [
    ...validateAdminEmail(input.email).problems,
    ...validateAdminPassword(input.password).problems,
  ];
  if (input.name.trim().length < 2) problems.push("חסר שם מלא.");
  if (problems.length > 0) {
    return { kind: "INVALID", message: "קלט אינו תקין.", problems };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true },
  });
  if (!organization) {
    return { kind: "CONFLICT", message: "הארגון אינו קיים." };
  }

  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { kind: "CONFLICT", message: "כבר קיים משתמש עם כתובת הדואר הזו." };
  }

  const passwordHash = await bcrypt.hash(input.password, MEMBER_BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash,
      // isSuperAdmin אינו מופיע כאן במתכוון — ברירת המחדל בסכימה היא false
      memberships: {
        create: {
          organizationId: input.organizationId,
          role: input.role,
          jobTitle: input.jobTitle?.trim() || null,
        },
      },
    },
    select: { id: true },
  });

  return { kind: "OK", value: { userId: user.id, role: input.role } };
}

/** משנה תפקיד של חבר ארגון קיים, תחת אותם כללים בדיוק */
export async function changeMemberRole(
  prisma: PrismaClient,
  actor: ActorContext,
  input: { membershipId: string; role: UserRole },
): Promise<UserManagementOutcome<{ membershipId: string; role: UserRole }>> {
  const membership = await prisma.organizationMember.findUnique({
    where: { id: input.membershipId },
    select: { id: true, organizationId: true, role: true, userId: true },
  });
  if (!membership) {
    return { kind: "CONFLICT", message: "החברות אינה קיימת." };
  }

  // גם התפקיד המבוקש וגם התפקיד הקיים נבדקים — אחרת אפשר היה "להוריד"
  // מישהו בכיר ואז לבנות אותו מחדש נמוך יותר
  for (const role of [input.role, membership.role]) {
    const decision = decideRoleAssignment({
      actorRole: actor.role,
      targetRole: role,
      actorIsSuperAdmin: actor.isSuperAdmin,
      actorOrganizationIds: actor.organizationIds,
      targetOrganizationId: membership.organizationId,
    });
    if (!decision.allowed) {
      return { kind: "DENIED", message: decision.message, reason: decision.reason };
    }
  }

  await prisma.organizationMember.update({
    where: { id: membership.id },
    data: { role: input.role },
  });

  return { kind: "OK", value: { membershipId: membership.id, role: input.role } };
}

export interface CreateOrganizationInput {
  name: string;
  type: "DEVELOPER" | "CONTRACTOR" | "TENANT_CHANGE_SERVICE" | "ARCHITECTURE_FIRM" | "CONSULTANT_FIRM";
  legalName?: string | null;
  city?: string | null;
}

/** יצירת ארגון — פעולה של מנהל פלטפורמה בלבד */
export async function createOrganization(
  prisma: PrismaClient,
  actor: ActorContext,
  input: CreateOrganizationInput,
): Promise<UserManagementOutcome<{ organizationId: string }>> {
  if (!actor.isSuperAdmin && actor.role !== "SUPER_ADMIN") {
    return {
      kind: "DENIED",
      message: "רק מנהל־על יכול ליצור ארגון חדש בפלטפורמה.",
      reason: "PLATFORM_ONLY",
    };
  }
  if (input.name.trim().length < 2) {
    return { kind: "INVALID", message: "קלט אינו תקין.", problems: ["חסר שם ארגון."] };
  }

  const organization = await prisma.organization.create({
    data: {
      name: input.name.trim(),
      type: input.type,
      legalName: input.legalName?.trim() || null,
      city: input.city?.trim() || null,
    },
    select: { id: true },
  });

  return { kind: "OK", value: { organizationId: organization.id } };
}
