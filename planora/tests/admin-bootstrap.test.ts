/**
 * אתחול מנהל־העל הראשון — מול מסד נתונים אמיתי.
 *
 * הבדיקות רצות על מסד נתונים ייעודי שנבנה ונמחק כאן, כי אתחול אפשרי פעם
 * אחת בלבד לכל מסד. מסד ההדגמה המשותף כבר מכיל מנהל־על ולכן אינו מתאים.
 */

import { afterAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

import {
  bootstrapFirstSuperAdmin,
  countSuperAdmins,
  readBootstrapState,
} from "@/server/services/admin-bootstrap";
import {
  changeMemberRole,
  createOrganization,
  createOrganizationMember,
  type ActorContext,
} from "@/server/services/user-management";
import { createTemporaryDatabase, type TemporaryDatabase } from "./helpers/test-database";

const SECRET = "Yb7#kQ2!vR9zLp4XnT6sWc1EgH8jMd5A";
const PASSWORD = "Oviax!Platform2026";
const EMAIL = "platform.owner@oviax.example";

// נבנה לפני איסוף הבדיקות, כדי ש-withDatabase יידע אם יש מסד לעבוד מולו
const database: TemporaryDatabase | null = await createTemporaryDatabase(
  "oviax_bootstrap_test",
);
const prisma = database?.prisma as PrismaClient;
let superAdminId = "";

afterAll(async () => {
  await database?.drop();
});

/** בלי הרשאה ליצור מסד נתונים הבדיקות מדלגות במקום להיכשל */
const withDatabase = () => (database ? it : it.skip);

describe("אתחול מנהל־העל", () => {
  withDatabase()("יוצר מנהל־על ראשון על מסד ריק", async () => {
    expect(await countSuperAdmins(prisma)).toBe(0);

    const outcome = await bootstrapFirstSuperAdmin(prisma, {
      email: EMAIL,
      name: "Platform Owner",
      password: PASSWORD,
      secret: SECRET,
      performedFrom: "vitest",
    });

    expect(outcome.kind).toBe("CREATED");
    if (outcome.kind !== "CREATED") return;
    superAdminId = outcome.userId;
    expect(outcome.role).toBe("SUPER_ADMIN");

    const user = await prisma.user.findUnique({ where: { id: outcome.userId } });
    expect(user?.isSuperAdmin).toBe(true);
    expect(user?.email).toBe(EMAIL);
  });

  withDatabase()("הסיסמה נשמרת מגובבת ונבדקת במנגנון הייצור", async () => {
    const user = await prisma.user.findUnique({ where: { id: superAdminId } });
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toBe(PASSWORD);
    expect(user?.passwordHash?.startsWith("$2")).toBe(true);
    // אותה השוואה שמבצע ספק ההתחברות בייצור
    expect(await bcrypt.compare(PASSWORD, user!.passwordHash!)).toBe(true);
    expect(await bcrypt.compare("wrong-password", user!.passwordHash!)).toBe(false);
  });

  withDatabase()("הסוד אינו נשמר — רק טביעת אצבע", async () => {
    const record = await prisma.adminBootstrap.findUnique({ where: { lock: "singleton" } });
    expect(record).not.toBeNull();
    expect(record?.method).toBe("BOOTSTRAP");
    expect(record?.role).toBe("SUPER_ADMIN");
    expect(record?.userId).toBe(superAdminId);
    expect(record?.secretFingerprint).not.toContain(SECRET);
    expect(record?.secretFingerprint).toHaveLength(64);

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(PASSWORD);
  });

  withDatabase()("הרצה שנייה נכשלת בבטחה ואינה משנה דבר", async () => {
    const before = await prisma.user.count();

    const outcome = await bootstrapFirstSuperAdmin(prisma, {
      email: "second.owner@oviax.example",
      name: "Second Owner",
      password: PASSWORD,
      secret: SECRET,
    });

    expect(["ALREADY_BOOTSTRAPPED", "SUPER_ADMIN_EXISTS"]).toContain(outcome.kind);
    expect(await prisma.user.count()).toBe(before);
    expect(await countSuperAdmins(prisma)).toBe(1);

    const state = await readBootstrapState(prisma);
    expect(state.alreadyBootstrapped).toBe(true);
    expect(state.record?.email).toBe(EMAIL);
  });
});

describe("ניהול משתמשים בידי מנהל־על", () => {
  const platformActor = (): ActorContext => ({
    userId: superAdminId,
    role: "SUPER_ADMIN",
    isSuperAdmin: true,
    organizationIds: [],
  });

  let organizationId = "";
  let otherOrganizationId = "";
  let orgAdminMembershipId = "";

  withDatabase()("מנהל־על יוצר ארגון", async () => {
    const outcome = await createOrganization(prisma, platformActor(), {
      name: "קבלן הדגמה",
      type: "CONTRACTOR",
    });
    expect(outcome.kind).toBe("OK");
    if (outcome.kind === "OK") organizationId = outcome.value.organizationId;

    const second = await createOrganization(prisma, platformActor(), {
      name: "קבלן אחר",
      type: "CONTRACTOR",
    });
    if (second.kind === "OK") otherOrganizationId = second.value.organizationId;
  });

  withDatabase()("מנהל־על יוצר מנהל ארגון", async () => {
    const outcome = await createOrganizationMember(prisma, platformActor(), {
      email: "org.admin@oviax.example",
      name: "מנהל הארגון",
      password: "Contractor!Admin2026",
      role: "ORGANIZATION_ADMIN",
      organizationId,
    });

    expect(outcome.kind).toBe("OK");
    if (outcome.kind !== "OK") return;

    const user = await prisma.user.findUnique({
      where: { id: outcome.value.userId },
      include: { memberships: true },
    });
    // מנהל ארגון לעולם אינו מקבל את דגל מנהל־העל
    expect(user?.isSuperAdmin).toBe(false);
    expect(user?.memberships[0]?.role).toBe("ORGANIZATION_ADMIN");
    expect(await bcrypt.compare("Contractor!Admin2026", user!.passwordHash!)).toBe(true);
    orgAdminMembershipId = user!.memberships[0]!.id;
  });

  withDatabase()("גם מנהל־על אינו יכול ליצור SUPER_ADMIN דרך הממשק", async () => {
    const outcome = await createOrganizationMember(prisma, platformActor(), {
      email: "second.super@oviax.example",
      name: "ניסיון",
      password: "Another!Strong2026",
      role: "SUPER_ADMIN",
      organizationId,
    });
    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind === "DENIED") expect(outcome.reason).toBe("SUPER_ADMIN_NOT_ASSIGNABLE");
    expect(await countSuperAdmins(prisma)).toBe(1);
  });

  withDatabase()("מנהל ארגון אינו יכול ליצור SUPER_ADMIN", async () => {
    const orgAdmin: ActorContext = {
      userId: "org-admin",
      role: "ORGANIZATION_ADMIN",
      isSuperAdmin: false,
      organizationIds: [organizationId],
    };

    const outcome = await createOrganizationMember(prisma, orgAdmin, {
      email: "escalation@oviax.example",
      name: "ניסיון הסלמה",
      password: "Escalate!Now2026",
      role: "SUPER_ADMIN",
      organizationId,
    });

    expect(outcome.kind).toBe("DENIED");
    expect(await countSuperAdmins(prisma)).toBe(1);
    expect(
      await prisma.user.findUnique({ where: { email: "escalation@oviax.example" } }),
    ).toBeNull();
  });

  withDatabase()("מנהל ארגון נשאר תחום לארגון שלו", async () => {
    const orgAdmin: ActorContext = {
      userId: "org-admin",
      role: "ORGANIZATION_ADMIN",
      isSuperAdmin: false,
      organizationIds: [organizationId],
    };

    const outcome = await createOrganizationMember(prisma, orgAdmin, {
      email: "cross.org@oviax.example",
      name: "ארגון אחר",
      password: "Cross!Org2026",
      role: "PROJECT_MANAGER",
      organizationId: otherOrganizationId,
    });

    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind === "DENIED") expect(outcome.reason).toBe("OUTSIDE_ACTOR_ORGANIZATION");

    // ובארגון שלו — מותר
    const allowed = await createOrganizationMember(prisma, orgAdmin, {
      email: "own.org@oviax.example",
      name: "מנהל פרויקט",
      password: "OwnOrg!Pass2026",
      role: "PROJECT_MANAGER",
      organizationId,
    });
    expect(allowed.kind).toBe("OK");
  });

  withDatabase()("מנהל פרויקט אינו יכול לשנות תפקידים", async () => {
    const projectManager: ActorContext = {
      userId: "pm",
      role: "PROJECT_MANAGER",
      isSuperAdmin: false,
      organizationIds: [organizationId],
    };

    const outcome = await changeMemberRole(prisma, projectManager, {
      membershipId: orgAdminMembershipId,
      role: "TENANT",
    });
    expect(outcome.kind).toBe("DENIED");

    const membership = await prisma.organizationMember.findUnique({
      where: { id: orgAdminMembershipId },
    });
    expect(membership?.role).toBe("ORGANIZATION_ADMIN");
  });

  withDatabase()("שינוי תפקיד ל-SUPER_ADMIN נדחה בצד השרת", async () => {
    const outcome = await changeMemberRole(prisma, platformActor(), {
      membershipId: orgAdminMembershipId,
      role: "SUPER_ADMIN",
    });
    expect(outcome.kind).toBe("DENIED");

    const membership = await prisma.organizationMember.findUnique({
      where: { id: orgAdminMembershipId },
    });
    expect(membership?.role).toBe("ORGANIZATION_ADMIN");
    expect(await countSuperAdmins(prisma)).toBe(1);
  });
});
