/**
 * הגנה מפני הסלמת הרשאות.
 *
 * SUPER_ADMIN הוא תפקיד הפלטפורמה. אף תפקיד באפליקציה אינו יכול להעניק
 * אותו — גם לא מנהל־על עצמו דרך הממשק. הבדיקות כאן טהורות ורצות בלי מסד
 * נתונים, כי הכלל עצמו חייב להיות נכון לפני שהוא נוגע בנתונים.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { UserRole } from "@prisma/client";

import { ROLE_CAPABILITIES, can } from "@/lib/auth/permissions";
import {
  assignableRolesFor,
  decideRoleAssignment,
  isAssignableRole,
} from "@/lib/auth/role-assignment";
import { PLATFORM_ADMIN_PATH, landingPathForRole } from "@/lib/auth/routing";
import {
  decideBootstrap,
  redactSecrets,
  secretFingerprint,
  secretsMatch,
  validateAdminPassword,
  validateBootstrapSecret,
} from "@/lib/admin/bootstrap";
import { checkSeedTarget } from "@/lib/admin/seed-guard";

const STRONG_SECRET = "Yb7#kQ2!vR9zLp4XnT6sWc1EgH8jMd5A";
const STRONG_PASSWORD = "Oviax!Platform2026";

describe("SUPER_ADMIN אינו ניתן להענקה", () => {
  it("אף תפקיד אינו יכול להעניק SUPER_ADMIN", () => {
    const roles = Object.keys(ROLE_CAPABILITIES) as UserRole[];
    for (const actorRole of roles) {
      const decision = decideRoleAssignment({
        actorRole,
        targetRole: "SUPER_ADMIN",
        actorIsSuperAdmin: actorRole === "SUPER_ADMIN",
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe("SUPER_ADMIN_NOT_ASSIGNABLE");
      }
    }
    expect(isAssignableRole("SUPER_ADMIN")).toBe(false);
  });

  it("SUPER_ADMIN אינו מופיע ברשימת התפקידים שניתן לבחור בממשק", () => {
    expect(assignableRolesFor("SUPER_ADMIN", true)).not.toContain("SUPER_ADMIN");
    expect(assignableRolesFor("ORGANIZATION_ADMIN")).not.toContain("SUPER_ADMIN");
  });
});

describe("מנהל ארגון", () => {
  it("אינו יכול ליצור SUPER_ADMIN", () => {
    const decision = decideRoleAssignment({
      actorRole: "ORGANIZATION_ADMIN",
      targetRole: "SUPER_ADMIN",
      actorOrganizationIds: ["org-a"],
      targetOrganizationId: "org-a",
    });
    expect(decision.allowed).toBe(false);
  });

  it("יכול ליצור תפקידים בארגון שלו", () => {
    for (const role of ["PROJECT_MANAGER", "TENANT_CHANGE_MANAGER", "TENANT"] as UserRole[]) {
      expect(
        decideRoleAssignment({
          actorRole: "ORGANIZATION_ADMIN",
          targetRole: role,
          actorOrganizationIds: ["org-a"],
          targetOrganizationId: "org-a",
        }).allowed,
      ).toBe(true);
    }
  });

  it("אינו יכול לגעת בארגון אחר", () => {
    const decision = decideRoleAssignment({
      actorRole: "ORGANIZATION_ADMIN",
      targetRole: "PROJECT_MANAGER",
      actorOrganizationIds: ["org-a"],
      targetOrganizationId: "org-b",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("OUTSIDE_ACTOR_ORGANIZATION");
  });

  it("אינו מקבל את יכולת ניהול הפלטפורמה", () => {
    expect(can("ORGANIZATION_ADMIN", "platform:administer")).toBe(false);
    expect(can("ORGANIZATION_ADMIN", "users:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "platform:administer")).toBe(true);
  });
});

describe("תפקידים שאינם מנהלים משתמשים", () => {
  it("מנהל פרויקט אינו יכול ליצור תפקיד גבוה ממנו ואינו מנהל משתמשים", () => {
    expect(can("PROJECT_MANAGER", "users:manage")).toBe(false);
    for (const role of ["SUPER_ADMIN", "ORGANIZATION_ADMIN"] as UserRole[]) {
      expect(
        decideRoleAssignment({ actorRole: "PROJECT_MANAGER", targetRole: role }).allowed,
      ).toBe(false);
    }
  });

  it("דייר ויועץ אינם יכולים לשנות תפקידים", () => {
    for (const actorRole of ["TENANT", "ELECTRICAL_CONSULTANT", "ARCHITECT"] as UserRole[]) {
      expect(can(actorRole, "users:manage")).toBe(false);
      expect(
        decideRoleAssignment({ actorRole, targetRole: "PROJECT_MANAGER" }).allowed,
      ).toBe(false);
    }
  });

  it("תפקיד שנשלח מהטופס נבדק מול המבצע — לא מתקבל כמו שהוא", () => {
    // ניסיון "לזייף" תפקיד גבוה בטופס של מנהל פרויקט
    const tampered = decideRoleAssignment({
      actorRole: "PROJECT_MANAGER",
      targetRole: "ORGANIZATION_ADMIN",
      actorOrganizationIds: ["org-a"],
      targetOrganizationId: "org-a",
    });
    expect(tampered.allowed).toBe(false);
  });
});

describe("גישה לאזור ניהול הפלטפורמה", () => {
  it("דייר אינו רשאי לגשת ל-/admin", () => {
    expect(can("TENANT", "platform:administer")).toBe(false);
  });

  it("מנהל־על רשאי לגשת ל-/admin", () => {
    expect(can("SUPER_ADMIN", "platform:administer")).toBe(true);
  });

  it("כל שאר התפקידים אינם רשאים", () => {
    const roles = (Object.keys(ROLE_CAPABILITIES) as UserRole[]).filter(
      (role) => role !== "SUPER_ADMIN",
    );
    for (const role of roles) {
      expect(can(role, "platform:administer")).toBe(false);
    }
  });
});

describe("ניתוב לפי תפקיד", () => {
  it("מנהל־על מגיע לאזור ניהול הפלטפורמה", () => {
    expect(landingPathForRole("SUPER_ADMIN")).toBe(PLATFORM_ADMIN_PATH);
    expect(landingPathForRole(null, true)).toBe(PLATFORM_ADMIN_PATH);
  });

  it("כל תפקיד מגיע לאזור שלו", () => {
    expect(landingPathForRole("TENANT")).toBe("/tenant");
    expect(landingPathForRole("ORGANIZATION_ADMIN")).toBe("/");
    expect(landingPathForRole("PROJECT_MANAGER")).toBe("/projects");
    expect(landingPathForRole("TENANT_CHANGE_MANAGER")).toBe("/my-work");
    expect(landingPathForRole("ELECTRICAL_CONSULTANT")).toBe("/my-work");
    expect(landingPathForRole("PRICING_MANAGER")).toBe("/pricing");
  });
});

describe("כללי האתחול", () => {
  it("אתחול נחסם כאשר כבר קיים מנהל־על", () => {
    const decision = decideBootstrap(
      { superAdminCount: 1, alreadyBootstrapped: false },
      {
        email: "owner@example.com",
        name: "Platform Owner",
        password: STRONG_PASSWORD,
        secret: STRONG_SECRET,
      },
    );
    expect(decision.kind).toBe("BLOCKED_SUPER_ADMIN_EXISTS");
  });

  it("אתחול נחסם אחרי שכבר בוצע", () => {
    const decision = decideBootstrap(
      { superAdminCount: 0, alreadyBootstrapped: true },
      {
        email: "owner@example.com",
        name: "Platform Owner",
        password: STRONG_PASSWORD,
        secret: STRONG_SECRET,
      },
    );
    expect(decision.kind).toBe("BLOCKED_ALREADY_BOOTSTRAPPED");
  });

  it("סוד חלש נדחה", () => {
    expect(validateBootstrapSecret("short").valid).toBe(false);
    expect(validateBootstrapSecret("a".repeat(40)).valid).toBe(false);
    expect(validateBootstrapSecret(STRONG_SECRET).valid).toBe(true);
  });

  it("סיסמה חלשה נדחית", () => {
    expect(validateAdminPassword("password").valid).toBe(false);
    expect(validateAdminPassword("Sh0rt!").valid).toBe(false);
    expect(validateAdminPassword(STRONG_PASSWORD).valid).toBe(true);
  });

  it("קלט תקין ומסד ריק מאפשרים אתחול", () => {
    const decision = decideBootstrap(
      { superAdminCount: 0, alreadyBootstrapped: false },
      {
        email: "  Owner@Example.com ",
        name: "Platform Owner",
        password: STRONG_PASSWORD,
        secret: STRONG_SECRET,
      },
    );
    expect(decision.kind).toBe("ALLOWED");
  });
});

describe("הסוד אינו דולף", () => {
  it("טביעת האצבע אינה מכילה את הסוד ואינה הפיכה", () => {
    const fingerprint = secretFingerprint(STRONG_SECRET);
    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain(STRONG_SECRET);
    expect(secretsMatch(STRONG_SECRET, STRONG_SECRET)).toBe(true);
    expect(secretsMatch(STRONG_SECRET, `${STRONG_SECRET}x`)).toBe(false);
  });

  it("הודעות שגיאה מנוקות מסודות", () => {
    const message = `connect failed for secret=${STRONG_SECRET} password=${STRONG_PASSWORD}`;
    const clean = redactSecrets(message, [STRONG_SECRET, STRONG_PASSWORD]);
    expect(clean).not.toContain(STRONG_SECRET);
    expect(clean).not.toContain(STRONG_PASSWORD);
    expect(clean).toContain("[redacted]");
  });
});

describe("זריעת הדגמה אינה מגיעה לייצור", () => {
  it("NODE_ENV=production חוסם", () => {
    const decision = checkSeedTarget({
      databaseUrl: "postgresql://u:p@127.0.0.1:5432/planora",
      nodeEnv: "production",
    });
    expect(decision.allowed).toBe(false);
  });

  it("מסד מרוחק חוסם", () => {
    const decision = checkSeedTarget({
      databaseUrl: "postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech/oviax",
      nodeEnv: "development",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("REMOTE_DATABASE");
  });

  it("מסד מקומי מותר", () => {
    expect(
      checkSeedTarget({
        databaseUrl: "postgresql://u:p@127.0.0.1:5432/planora",
        nodeEnv: "development",
      }).allowed,
    ).toBe(true);
  });
});

describe("הסוד אינו מגיע לדפדפן", () => {
  const SECRET_VARS = [
    "SUPER_ADMIN_BOOTSTRAP_SECRET",
    "SUPER_ADMIN_PASSWORD",
  ];

  /** כל קובצי המקור של האפליקציה — מה שנארז ונשלח לדפדפן */
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("משתני הסוד אינם נקראים בקוד האפליקציה, רק בסקריפט השרת", () => {
    // אזכור בהודעת שגיאה מותר. קריאה בפועל מ-process.env אינה מותרת,
    // כי קוד תחת src/ עלול להיארז לדפדפן.
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) => {
      const contents = readFileSync(file, "utf8");
      return SECRET_VARS.some((name) =>
        new RegExp(`process\\.env(\\.|\\[["'])${name}`).test(contents),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("אין משתנה סביבה חשוף לדפדפן שמכיל סוד", () => {
    const files = [
      ...sourceFiles(join(process.cwd(), "src")),
      ...sourceFiles(join(process.cwd(), "scripts")),
    ];
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|PASSWORD|TOKEN)/);
    }
  });

  it("אין סיסמאות הדגמה בקוד האפליקציה", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) =>
      readFileSync(file, "utf8").includes("oviax2026"),
    );
    expect(offenders).toEqual([]);
  });
});
