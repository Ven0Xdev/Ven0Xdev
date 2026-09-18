/**
 * זהות והרשאות בצד השרת.
 *
 * כל מסך וכל פעולה עוברים דרך הפונקציות כאן. ארגון אחד לעולם אינו רואה מידע
 * של ארגון אחר, והבדיקה נעשית בשאילתה עצמה ולא בתצוגה.
 */

import { notFound, redirect } from "next/navigation";
import type { Organization, OrganizationMember, UserRole } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { can, type Capability } from "./permissions";

export type MembershipWithOrg = OrganizationMember & { organization: Organization };

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  isSuperAdmin: boolean;
  memberships: MembershipWithOrg[];
  /** הארגון והתפקיד הראשיים להצגה בממשק */
  primaryMembership: MembershipWithOrg | null;
  organizationIds: string[];
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { isActive: true },
        include: { organization: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name ?? "משתמש",
    email: user.email,
    image: user.image,
    isSuperAdmin: user.isSuperAdmin,
    memberships: user.memberships,
    primaryMembership: user.memberships[0] ?? null,
    organizationIds: user.memberships.map((membership) => membership.organizationId),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** התפקיד של המשתמש בארגון מסוים */
export function roleInOrganization(
  user: SessionUser,
  organizationId: string,
): UserRole | null {
  const membership = user.memberships.find(
    (entry) => entry.organizationId === organizationId,
  );
  return membership?.role ?? null;
}

export function primaryRole(user: SessionUser): UserRole | null {
  return user.primaryMembership?.role ?? null;
}

export class AccessDeniedError extends Error {
  constructor(message = "אין לך הרשאה לבצע פעולה זו") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export interface ProjectAccess {
  user: SessionUser;
  role: UserRole;
  organizationId: string;
  projectId: string;
}

/**
 * מאמת גישה לפרויקט ומחזיר את התפקיד של המשתמש בו.
 * פרויקט שאינו בהישג ידו של המשתמש מוחזר כ"לא נמצא" — כדי לא לחשוף את קיומו.
 */
export async function requireProjectAccess(
  projectId: string,
  capability?: Capability,
): Promise<ProjectAccess> {
  const user = await requireUser();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });

  if (!project) notFound();

  const role = user.isSuperAdmin
    ? ("SUPER_ADMIN" as UserRole)
    : roleInOrganization(user, project.organizationId);

  if (!role) notFound();
  if (capability && !can(role, capability)) {
    throw new AccessDeniedError();
  }

  return { user, role, organizationId: project.organizationId, projectId: project.id };
}

export interface ApartmentAccess extends ProjectAccess {
  apartmentId: string;
}

export async function requireApartmentAccess(
  apartmentId: string,
  capability?: Capability,
): Promise<ApartmentAccess> {
  const apartment = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    select: { id: true, projectId: true },
  });

  if (!apartment) notFound();

  const access = await requireProjectAccess(apartment.projectId, capability);
  return { ...access, apartmentId: apartment.id };
}

/** בדיקת יכולת ברמת הארגון הראשי של המשתמש */
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await requireUser();
  const role = user.isSuperAdmin ? ("SUPER_ADMIN" as UserRole) : primaryRole(user);

  if (!can(role, capability)) {
    throw new AccessDeniedError();
  }
  return user;
}

/** מסנן הבסיס לכל שאילתה רוחבית — רק ארגונים שהמשתמש חבר בהם */
export function organizationScope(user: SessionUser): { organizationId: { in: string[] } } {
  return { organizationId: { in: user.organizationIds } };
}
