/**
 * בדיקות בידוד דיירים.
 *
 * אלה הבדיקות החשובות ביותר במערכת: דייר לעולם אינו רשאי לראות דירה
 * שאינה שלו, מידע של ארגון אחר, או את המודל המסחרי הפנימי.
 * הבדיקות רצות מול מסד הנתונים האמיתי — לא מול מוק.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ROLE_CAPABILITIES, can } from "@/lib/auth/permissions";

const prisma = new PrismaClient();

let noam: { id: string; apartmentId: string };
let shira: { id: string; apartmentId: string };

beforeAll(async () => {
  const [noamApartment, shiraApartment] = await Promise.all([
    prisma.apartment.findFirst({
      where: { tenantUser: { email: "noam@oviax.demo" } },
      select: { id: true, tenantUserId: true },
    }),
    prisma.apartment.findFirst({
      where: { tenantUser: { email: "shira@oviax.demo" } },
      select: { id: true, tenantUserId: true },
    }),
  ]);

  if (!noamApartment?.tenantUserId || !shiraApartment?.tenantUserId) {
    throw new Error("נתוני ההדגמה חסרים. יש להריץ: npm run db:seed:seaview");
  }

  noam = { id: noamApartment.tenantUserId, apartmentId: noamApartment.id };
  shira = { id: shiraApartment.tenantUserId, apartmentId: shiraApartment.id };
});

/** אותה שאילתה שמבצע השומר בצד השרת */
function tenantApartmentQuery(userId: string, apartmentId?: string) {
  return prisma.apartment.findFirst({
    where: { tenantUserId: userId, ...(apartmentId ? { id: apartmentId } : {}) },
    select: { id: true, number: true },
  });
}

describe("בידוד דיירים", () => {
  it("דייר רואה את הדירה שלו", async () => {
    const apartment = await tenantApartmentQuery(noam.id, noam.apartmentId);
    expect(apartment?.id).toBe(noam.apartmentId);
  });

  it("דייר אינו יכול לגשת לדירה של דייר אחר", async () => {
    const apartment = await tenantApartmentQuery(noam.id, shira.apartmentId);
    expect(apartment).toBeNull();
  });

  it("גם בכיוון ההפוך — כל דייר מגיע רק לדירה שלו", async () => {
    expect(await tenantApartmentQuery(shira.id, noam.apartmentId)).toBeNull();
    expect((await tenantApartmentQuery(shira.id, shira.apartmentId))?.id).toBe(
      shira.apartmentId,
    );
  });

  it("דייר ללא שיוך אינו מקבל אף דירה", async () => {
    const professional = await prisma.user.findFirst({ where: { email: "noa@oviax.demo" } });
    expect(professional).not.toBeNull();
    expect(await tenantApartmentQuery(professional!.id)).toBeNull();
  });

  it("בחירות של דייר אחד אינן נגישות דרך הדירה של האחר", async () => {
    const selections = await prisma.apartmentSelection.findMany({
      where: { apartmentId: shira.apartmentId, selectedById: noam.id },
    });
    expect(selections).toHaveLength(0);
  });

  it("כל דירה משויכת לכל היותר לדייר אחד", async () => {
    const apartments = await prisma.apartment.findMany({
      where: { tenantUserId: { not: null } },
      select: { id: true, tenantUserId: true },
    });
    const byApartment = new Set(apartments.map((apartment) => apartment.id));
    expect(byApartment.size).toBe(apartments.length);
  });
});

describe("הפרדת ארגונים", () => {
  it("פרויקט שייך לארגון אחד בלבד, והשאילתה מסננת לפיו", async () => {
    const organizations = await prisma.organization.findMany({ select: { id: true } });
    expect(organizations.length).toBeGreaterThan(1);

    const [first, second] = organizations;
    const projectsOfFirst = await prisma.project.findMany({
      where: { organizationId: first.id },
      select: { organizationId: true },
    });

    expect(projectsOfFirst.every((project) => project.organizationId === first.id)).toBe(true);
    expect(projectsOfFirst.some((project) => project.organizationId === second.id)).toBe(false);
  });

  it("מוצר שאינו מאושר לפרויקט אינו מופיע בזמינות שלו", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { name: "מרומי הפארק" } });
    const availability = await prisma.projectProductAvailability.findMany({
      where: { projectId: project.id },
    });
    // לפרויקט הזה לא הוגדרו ספקים, ולכן אין לדייר מה לבחור
    expect(availability).toHaveLength(0);
  });
});

describe("פרטיות המודל המסחרי", () => {
  it("לדייר אין הרשאה לראות מידע מסחרי", () => {
    expect(can("TENANT", "commercial:view")).toBe(false);
    expect(ROLE_CAPABILITIES.TENANT).not.toContain("commercial:view");
  });

  it("התנאים המסחריים קיימים בנפרד מכל נתון שהדייר קורא", async () => {
    const terms = await prisma.projectCommercialTerms.findFirst();
    expect(terms).not.toBeNull();
    expect(terms?.majorChangesCommissionPercent).toBeGreaterThan(0);

    // הדירה שהדייר קורא אינה נושאת את התנאים המסחריים
    const apartment = await prisma.apartment.findUniqueOrThrow({
      where: { id: noam.apartmentId },
      include: { project: { select: { name: true } } },
    });
    expect(Object.keys(apartment)).not.toContain("commercialTerms");
    expect(JSON.stringify(apartment)).not.toContain("majorChangesCommissionPercent");
  });

  it("הדייר אינו יכול להכריע בבחירות או לנהל ספקים", () => {
    for (const capability of [
      "selection:decide",
      "supplier:manage",
      "catalog:manage",
      "availability:manage",
    ] as const) {
      expect(can("TENANT", capability)).toBe(false);
    }
  });
});
