/**
 * מי רשאי להעניק איזה תפקיד.
 *
 * שני כללים שאינם ניתנים לעקיפה:
 *
 * 1. SUPER_ADMIN אינו ניתן להענקה דרך האפליקציה — בשום מסך, בשום פעולה,
 *    בשום תפקיד. הוא נוצר אך ורק על ידי מנגנון האתחול החד־פעמי.
 * 2. אין מעניקים תפקיד גבוה מהתפקיד של המעניק.
 *
 * הבדיקות כאן טהורות, והן נקראות בצד השרת בכל פעולה שנוגעת בתפקידים.
 * ה-UI אינו מנגנון אבטחה.
 */

import type { UserRole } from "@prisma/client";

import { can } from "./permissions";

/**
 * דירוג התפקידים. משמש רק להשוואה — "אין מעניקים גבוה ממך".
 * המספרים אינם מופיעים בממשק ואינם נשמרים במסד הנתונים.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ORGANIZATION_ADMIN: 80,
  PROJECT_MANAGER: 60,
  TENANT_CHANGE_MANAGER: 50,
  TENANT_CHANGE_COORDINATOR: 40,
  PRICING_MANAGER: 35,
  FINANCE: 35,
  ARCHITECT: 30,
  DESIGNER: 30,
  BIM_MANAGER: 30,
  HVAC_CONSULTANT: 30,
  PLUMBING_CONSULTANT: 30,
  ELECTRICAL_CONSULTANT: 30,
  STRUCTURAL_CONSULTANT: 30,
  TENANT: 10,
};

/** תפקידים שלעולם אינם ניתנים להענקה דרך האפליקציה */
export const NON_ASSIGNABLE_ROLES: UserRole[] = ["SUPER_ADMIN"];

export type RoleAssignmentRefusal =
  | "SUPER_ADMIN_NOT_ASSIGNABLE"
  | "MISSING_USER_MANAGEMENT"
  | "ROLE_ABOVE_ACTOR"
  | "OUTSIDE_ACTOR_ORGANIZATION";

export type RoleAssignmentDecision =
  | { allowed: true }
  | { allowed: false; reason: RoleAssignmentRefusal; message: string };

const REFUSAL_MESSAGES: Record<RoleAssignmentRefusal, string> = {
  SUPER_ADMIN_NOT_ASSIGNABLE:
    "תפקיד SUPER_ADMIN אינו ניתן להענקה דרך המערכת. הוא נוצר רק באתחול הראשוני.",
  MISSING_USER_MANAGEMENT: "אין לך הרשאה לנהל משתמשים ותפקידים.",
  ROLE_ABOVE_ACTOR: "אי אפשר להעניק תפקיד גבוה מהתפקיד שלך.",
  OUTSIDE_ACTOR_ORGANIZATION: "אפשר לנהל משתמשים רק בארגון שלך.",
};

function refuse(reason: RoleAssignmentRefusal): RoleAssignmentDecision {
  return { allowed: false, reason, message: REFUSAL_MESSAGES[reason] };
}

/** האם התפקיד המבוקש ניתן להענקה בכלל */
export function isAssignableRole(role: UserRole): boolean {
  return !NON_ASSIGNABLE_ROLES.includes(role);
}

/**
 * ההחלטה המרכזית. `actorRole` הוא התפקיד האפקטיבי של המבצע —
 * SUPER_ADMIN למנהל־על פלטפורמה, אחרת התפקיד שלו בארגון הנוגע בדבר.
 */
export function decideRoleAssignment(params: {
  actorRole: UserRole | null | undefined;
  targetRole: UserRole;
  /** הארגונים שהמבצע חבר בהם. מנהל־על אינו מוגבל. */
  actorOrganizationIds?: string[];
  targetOrganizationId?: string;
  actorIsSuperAdmin?: boolean;
}): RoleAssignmentDecision {
  const { actorRole, targetRole, targetOrganizationId } = params;

  // נבדק ראשון — כך שגם מנהל־על אינו יכול לשכפל את עצמו דרך הממשק
  if (!isAssignableRole(targetRole)) return refuse("SUPER_ADMIN_NOT_ASSIGNABLE");

  if (!can(actorRole, "users:manage")) return refuse("MISSING_USER_MANAGEMENT");

  if (!actorRole || ROLE_RANK[targetRole] > ROLE_RANK[actorRole]) {
    return refuse("ROLE_ABOVE_ACTOR");
  }

  const isPlatformAdmin = params.actorIsSuperAdmin === true || actorRole === "SUPER_ADMIN";
  if (!isPlatformAdmin && targetOrganizationId) {
    const scope = params.actorOrganizationIds ?? [];
    if (!scope.includes(targetOrganizationId)) return refuse("OUTSIDE_ACTOR_ORGANIZATION");
  }

  return { allowed: true };
}

/** התפקידים שהמבצע רשאי להציג בטופס. הממשק נגזר מהכלל, לא להפך. */
export function assignableRolesFor(
  actorRole: UserRole | null | undefined,
  actorIsSuperAdmin = false,
): UserRole[] {
  return (Object.keys(ROLE_RANK) as UserRole[]).filter(
    (role) =>
      decideRoleAssignment({
        actorRole,
        targetRole: role,
        actorIsSuperAdmin,
        // בלי ארגון יעד — הבדיקה הארגונית נעשית בעת השמירה
      }).allowed,
  );
}
