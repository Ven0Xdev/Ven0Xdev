/**
 * לאן מגיע כל תפקיד אחרי התחברות.
 *
 * טהור ובדיק. השרת מחליט — לא הדפדפן, ולא פרמטר בכתובת.
 */

import type { UserRole } from "@prisma/client";

import { isConsultantRole, isTenantRole } from "./permissions";

/** אזור ניהול הפלטפורמה. חשוף למנהל־על בלבד. */
export const PLATFORM_ADMIN_PATH = "/admin";
/** האזור האישי של הדייר */
export const TENANT_PATH = "/tenant";

export function landingPathForRole(
  role: UserRole | null | undefined,
  isSuperAdmin = false,
): string {
  if (isSuperAdmin || role === "SUPER_ADMIN") return PLATFORM_ADMIN_PATH;
  if (isTenantRole(role)) return TENANT_PATH;
  if (isConsultantRole(role)) return "/my-work";

  switch (role) {
    case "ORGANIZATION_ADMIN":
      return "/";
    case "PROJECT_MANAGER":
      return "/projects";
    case "TENANT_CHANGE_MANAGER":
    case "TENANT_CHANGE_COORDINATOR":
      return "/my-work";
    case "PRICING_MANAGER":
    case "FINANCE":
      return "/pricing";
    default:
      return "/";
  }
}
