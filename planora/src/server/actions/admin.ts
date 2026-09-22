"use server";

/**
 * פעולות אזור ניהול הפלטפורמה.
 *
 * כל פעולה כאן בונה את זהות המבצע מהסשן בצד השרת. התפקיד המבוקש מגיע
 * מהטופס, ולכן הוא נבדק — ראו src/server/services/user-management.ts.
 * אין כאן שום נתיב שמעניק SUPER_ADMIN.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { effectiveRole, requirePlatformAdmin, requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isAssignableRole } from "@/lib/auth/role-assignment";
import {
  changeMemberRole,
  createOrganization,
  createOrganizationMember,
  type ActorContext,
  type UserManagementOutcome,
} from "@/server/services/user-management";

export interface AdminActionResult {
  ok: boolean;
  message: string;
  problems?: string[];
}

const ADMIN_PATH = "/admin";

async function actorFromSession(): Promise<ActorContext> {
  const user = await requireUser();
  return {
    userId: user.id,
    role: effectiveRole(user),
    isSuperAdmin: user.isSuperAdmin,
    organizationIds: user.organizationIds,
  };
}

function present<T>(outcome: UserManagementOutcome<T>, success: string): AdminActionResult {
  switch (outcome.kind) {
    case "OK":
      return { ok: true, message: success };
    case "DENIED":
    case "CONFLICT":
      return { ok: false, message: outcome.message };
    case "INVALID":
      return { ok: false, message: outcome.message, problems: outcome.problems };
  }
}

const organizationSchema = z.object({
  name: z.string().min(2, "חסר שם ארגון."),
  type: z.enum([
    "DEVELOPER",
    "CONTRACTOR",
    "TENANT_CHANGE_SERVICE",
    "ARCHITECTURE_FIRM",
    "CONSULTANT_FIRM",
  ]),
  legalName: z.string().optional(),
  city: z.string().optional(),
});

export async function createOrganizationAction(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requirePlatformAdmin();
  const actor = await actorFromSession();

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    legalName: formData.get("legalName") ?? undefined,
    city: formData.get("city") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "קלט אינו תקין.",
      problems: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const outcome = await createOrganization(prisma, actor, parsed.data);
  if (outcome.kind === "OK") revalidatePath(ADMIN_PATH);
  return present(outcome, "הארגון נוצר.");
}

const memberSchema = z.object({
  email: z.string().min(3),
  name: z.string().min(2),
  password: z.string().min(1),
  role: z.string().min(1),
  organizationId: z.string().min(1),
  jobTitle: z.string().optional(),
});

export async function createMemberAction(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireUser();
  if (!can(effectiveRole(user), "users:manage")) {
    return { ok: false, message: "אין לך הרשאה לנהל משתמשים." };
  }

  const parsed = memberSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
    organizationId: formData.get("organizationId"),
    jobTitle: formData.get("jobTitle") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "יש למלא את כל השדות." };
  }

  // תפקיד שאינו ניתן להענקה נדחה עוד לפני שהוא נוגע בשירות
  const role = parsed.data.role as UserRole;
  if (!isAssignableRole(role)) {
    return {
      ok: false,
      message: "תפקיד SUPER_ADMIN אינו ניתן להענקה דרך המערכת.",
    };
  }

  const actor = await actorFromSession();
  const outcome = await createOrganizationMember(prisma, actor, { ...parsed.data, role });
  if (outcome.kind === "OK") revalidatePath(`${ADMIN_PATH}/users`);
  return present(outcome, "המשתמש נוצר.");
}

export async function changeMemberRoleAction(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireUser();
  if (!can(effectiveRole(user), "users:manage")) {
    return { ok: false, message: "אין לך הרשאה לנהל משתמשים." };
  }

  const membershipId = formData.get("membershipId");
  const role = formData.get("role");
  if (typeof membershipId !== "string" || typeof role !== "string") {
    return { ok: false, message: "קלט אינו תקין." };
  }
  if (!isAssignableRole(role as UserRole)) {
    return { ok: false, message: "תפקיד SUPER_ADMIN אינו ניתן להענקה דרך המערכת." };
  }

  const actor = await actorFromSession();
  const outcome = await changeMemberRole(prisma, actor, {
    membershipId,
    role: role as UserRole,
  });
  if (outcome.kind === "OK") revalidatePath(`${ADMIN_PATH}/users`);
  return present(outcome, "התפקיד עודכן.");
}
