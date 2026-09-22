/**
 * נתוני הדגמה עבור OVIAX.
 *
 * הנתונים נבנים דרך אותם שירותים שמשמשים בייצור — השינויים נוצרים על ידי
 * מנוע ההשוואה ומנוע הכללים, ולא נכתבים ידנית לבסיס הנתונים.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import type {
  ActivityKind,
  ApartmentStatus,
  ChangeCategoryKey,
  ConsultantKind,
  UserRole,
} from "@prisma/client";

import { modifiedApartment42, standardApartment42 } from "../src/lib/drawing/demo/apartment-42";
import type { DrawingDocument } from "../src/lib/drawing/types";
import { SYSTEM_RULES } from "../src/lib/rules/system-rules";
import { CHANGE_CATEGORY_LABELS } from "../src/lib/i18n/he";
import { buildPricingLines } from "../src/lib/pricing/engine";
import { assertSeedTargetIsSafe } from "../src/lib/admin/seed-guard";

// נתוני הדגמה לעולם אינם נכתבים לייצור
assertSeedTargetIsSafe();

const prisma = new PrismaClient();

const CATEGORY_KEYS: ChangeCategoryKey[] = [
  "ELECTRICAL",
  "LIGHTING",
  "WALL",
  "DOOR",
  "WINDOW",
  "PLUMBING",
  "HVAC",
  "KITCHEN",
  "SANITARY",
  "COMMUNICATION",
  "OTHER",
];

const BUYER_NAMES = [
  "נועם לוי",
  "שירה אדרי",
  "איתי בן חיים",
  "מאיה פרידמן",
  "יונתן שרעבי",
  "טל אזולאי",
  "הילה מזרחי",
  "אורן דהן",
  "רותם ניסים",
  "עידן קסטן",
  "נטע הראל",
  "אסף גבאי",
  "ליאור עמר",
  "דנה שפירא",
  "גיא אלמוג",
  "עינב טולדנו",
  "רון בכר",
  "שקד ימיני",
  "אלון וקנין",
  "מיטל צור",
];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9 + (days % 8), (days * 7) % 60, 0, 0);
  return date;
}

function daysAhead(days: number): Date {
  return daysAgo(-days);
}

async function reset() {
  // סדר המחיקה חשוב בגלל מפתחות זרים
  await prisma.$transaction([
    prisma.aITrainingCorrection.deleteMany(),
    prisma.changeItemRuleHit.deleteMany(),
    prisma.pricingLine.deleteMany(),
    prisma.pricingSheet.deleteMany(),
    prisma.consultantResponse.deleteMany(),
    prisma.consultantRequest.deleteMany(),
    prisma.reviewComment.deleteMany(),
    prisma.review.deleteMany(),
    prisma.professionalDecision.deleteMany(),
    prisma.professionalAssignment.deleteMany(),
    prisma.approval.deleteMany(),
    prisma.aIAnalysis.deleteMany(),
    prisma.changeItem.deleteMany(),
    prisma.changeSet.deleteMany(),
    prisma.drawingFile.deleteMany(),
    prisma.planVersion.deleteMany(),
    prisma.plan.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.uploadedFile.deleteMany(),
    prisma.priceBookItem.deleteMany(),
    prisma.priceBook.deleteMany(),
    prisma.projectRule.deleteMany(),
    prisma.rule.deleteMany(),
    prisma.changeCategory.deleteMany(),
    prisma.apartment.deleteMany(),
    prisma.apartmentType.deleteMany(),
    prisma.floor.deleteMany(),
    prisma.building.deleteMany(),
    prisma.project.deleteMany(),
    prisma.organizationMember.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function main() {
  console.log("מנקה נתונים קיימים...");
  await reset();

  // -------------------------------------------------------------------------
  // ארגונים
  // -------------------------------------------------------------------------
  console.log("יוצר ארגונים ומשתמשים...");

  const service = await prisma.organization.create({
    data: {
      name: "אורבן ניהול שינויי דיירים",
      legalName: "אורבן ניהול שינויי דיירים בע\"מ",
      type: "TENANT_CHANGE_SERVICE",
      city: "תל אביב-יפו",
      address: "דרך מנחם בגין 132",
      phone: "03-5550140",
    },
  });

  const developer = await prisma.organization.create({
    data: {
      name: "יזמות הדגמה",
      legalName: "יזמות הדגמה בע\"מ",
      type: "DEVELOPER",
      city: "הרצליה",
      address: "אבא אבן 10",
      phone: "09-7770120",
    },
  });

  const users = await seedUsers(service.id, developer.id);

  // -------------------------------------------------------------------------
  // פרויקטים
  // -------------------------------------------------------------------------
  console.log("יוצר פרויקטים...");

  const project = await prisma.project.create({
    data: {
      organizationId: service.id,
      name: "פארק רזידנס",
      code: "PRK",
      developerName: "יזמות הדגמה",
      contractorName: "בנייה הדגמה",
      address: "רחוב הפארק 18",
      city: "ראשון לציון",
      status: "TENANT_CHANGES",
      description:
        "שני בנייני מגורים, 78 דירות. שלב שינויי דיירים פתוח עד לתאריך הקבוע בחוזה.",
      tenantChangeManagerId: users.yael.id,
      changeDeadline: daysAhead(45),
    },
  });

  const secondProject = await prisma.project.create({
    data: {
      organizationId: service.id,
      name: "מרומי הפארק",
      code: "MRM",
      developerName: "אלמוג נכסים",
      contractorName: "בנייה הדגמה",
      address: "שדרות ירושלים 4",
      city: "רמת גן",
      status: "PLANNING",
      description: "פרויקט שני של אותה חברת ניהול שינויי דיירים, עבור יזם אחר.",
      tenantChangeManagerId: users.yael.id,
    },
  });

  await prisma.changeCategory.createMany({
    data: CATEGORY_KEYS.map((key, index) => ({
      projectId: project.id,
      key,
      label: CHANGE_CATEGORY_LABELS[key],
      sortOrder: index,
    })),
  });

  // -------------------------------------------------------------------------
  // כללים
  // -------------------------------------------------------------------------
  console.log("יוצר כללי מערכת וכללי פרויקט...");

  for (const rule of SYSTEM_RULES) {
    await prisma.rule.create({
      data: {
        organizationId: service.id,
        key: rule.key,
        name: rule.name,
        description: rule.description,
        condition: rule.condition as unknown as Prisma.InputJsonValue,
        effect: rule.effect,
        consultantKind: rule.consultantKind ?? null,
        severity: rule.severity,
        isSystem: true,
      },
    });
  }

  await prisma.projectRule.createMany({
    data: [
      {
        projectId: project.id,
        key: "PRJ_W15_LOCKED",
        name: "קיר W15 אינו ניתן לשינוי",
        description:
          "בקיר W15 עוברת צנרת אנכית משותפת. לא ניתן לבצע בו שינוי ללא אישור אדריכל הפרויקט.",
        condition: { elementTag: "W15" } as unknown as Prisma.InputJsonValue,
        effect: "BLOCK_AUTOMATIC_WORKFLOW",
        severity: "BLOCKING",
      },
      {
        projectId: project.id,
        key: "PRJ_PLUMBING_CONSULTANT",
        name: "כל שינוי אינסטלציה דורש אישור יועץ",
        description: "בפרויקט זה כל שינוי במערכת האינסטלציה מועבר לאישור יועץ האינסטלציה.",
        condition: { categoryKey: ["PLUMBING", "SANITARY"] } as unknown as Prisma.InputJsonValue,
        effect: "REQUIRE_CONSULTANT",
        consultantKind: "PLUMBING" as ConsultantKind,
        severity: "WARNING",
      },
      {
        projectId: project.id,
        key: "PRJ_HVAC_AFTER_DEADLINE",
        name: "שינוי מיזוג לאחר מועד הסגירה דורש אישור מנהל",
        description:
          "שינויים במערכת המיזוג שנקלטו לאחר מועד סגירת שלב המיזוג דורשים אישור מנהל הפרויקט.",
        condition: {
          categoryKey: "HVAC",
          occurredAfter: daysAgo(120).toISOString(),
        } as unknown as Prisma.InputJsonValue,
        effect: "REQUIRE_MANAGER_REVIEW",
        severity: "WARNING",
      },
      {
        projectId: project.id,
        key: "PRJ_WALL_REMOVAL_REVIEW",
        name: "ביטול קיר דורש בדיקה מול תוכנית הסטנדרט",
        description: "כל ביטול של קיר או מחיצה נבדק מול תוכנית הסטנדרט לפני העברה לתמחור.",
        condition: {
          categoryKey: "WALL",
          changeType: "REMOVED",
        } as unknown as Prisma.InputJsonValue,
        effect: "REQUIRE_MANAGER_REVIEW",
        severity: "WARNING",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // מבנה הפרויקט
  // -------------------------------------------------------------------------
  console.log("יוצר בניינים, קומות, טיפוסים ודירות...");

  const buildingA = await prisma.building.create({
    data: { projectId: project.id, name: "בניין A", code: "A", floors: 12 },
  });
  const buildingB = await prisma.building.create({
    data: { projectId: project.id, name: "בניין B", code: "B", floors: 10 },
  });

  const typeThree = await prisma.apartmentType.create({
    data: { projectId: project.id, name: "טיפוס 3 חדרים", rooms: 3, areaSqm: 82, balconies: 1 },
  });
  const typeFour = await prisma.apartmentType.create({
    data: { projectId: project.id, name: "טיפוס 4 חדרים", rooms: 4, areaSqm: 104, balconies: 1 },
  });
  const typeFive = await prisma.apartmentType.create({
    data: { projectId: project.id, name: "טיפוס 5 חדרים", rooms: 5, areaSqm: 128, balconies: 2 },
  });

  const statusCycle: ApartmentStatus[] = [
    "STANDARD",
    "STANDARD",
    "CHANGES_IN_PROGRESS",
    "STANDARD",
    "AWAITING_REVIEW",
    "STANDARD",
    "AWAITING_PRICING",
    "STANDARD",
    "NEEDS_CORRECTION",
    "STANDARD",
    "AWAITING_CONSULTANT",
    "CHANGES_IN_PROGRESS",
    "STANDARD",
    "AWAITING_TENANT_APPROVAL",
    "STANDARD",
    "PAID",
    "STANDARD",
    "APPROVED_FOR_EXECUTION",
  ];

  const apartments: { id: string; number: string }[] = [];
  let apartmentIndex = 0;

  for (const [building, floorCount, perFloor] of [
    [buildingA, 12, 4],
    [buildingB, 10, 3],
  ] as const) {
    for (let floorNumber = 1; floorNumber <= floorCount; floorNumber += 1) {
      const floor = await prisma.floor.create({
        data: { buildingId: building.id, number: floorNumber, label: `קומה ${floorNumber}` },
      });

      for (let unit = 1; unit <= perFloor; unit += 1) {
        const number = String((floorNumber - 1) * perFloor + unit);
        const typeId = unit === 1 ? typeThree.id : unit === perFloor ? typeFive.id : typeFour.id;

        const apartment = await prisma.apartment.create({
          data: {
            projectId: project.id,
            buildingId: building.id,
            floorId: floor.id,
            apartmentTypeId: building.id === buildingA.id && number === "42" ? typeFour.id : typeId,
            number,
            buyerName: BUYER_NAMES[apartmentIndex % BUYER_NAMES.length],
            buyerContact: `05${(2 + (apartmentIndex % 6))}-${String(1000000 + apartmentIndex * 7331).slice(0, 7)}`,
            status: statusCycle[apartmentIndex % statusCycle.length],
            assignedManagerId: users.yael.id,
            assignedCoordinatorId: users.ronit.id,
            dueDate: daysAhead(10 + (apartmentIndex % 30)),
          },
        });

        apartments.push({ id: apartment.id, number });
        apartmentIndex += 1;
      }
    }
  }

  const apartment42 = await prisma.apartment.findFirstOrThrow({
    where: { projectId: project.id, buildingId: buildingA.id, number: "42" },
  });

  await prisma.apartment.update({
    where: { id: apartment42.id },
    data: {
      buyerName: "נועם לוי",
      buyerContact: "052-7481930",
      status: "AWAITING_REVIEW",
      dueDate: daysAhead(4),
    },
  });

  // -------------------------------------------------------------------------
  // מחירון
  // -------------------------------------------------------------------------
  console.log("יוצר מחירון...");

  const priceBook = await prisma.priceBook.create({
    data: {
      organizationId: service.id,
      projectId: project.id,
      name: "מחירון שינויי דיירים — פארק רזידנס",
      vatRate: 18,
    },
  });

  await prisma.priceBookItem.createMany({
    data: [
      { priceBookId: priceBook.id, code: "EL-01", name: "שקע נוסף", categoryKey: "ELECTRICAL", changeType: "ADDED", unit: "UNIT", unitPrice: 185 },
      { priceBookId: priceBook.id, code: "EL-02", name: "הזזת שקע", categoryKey: "ELECTRICAL", changeType: "MOVED", unit: "UNIT", unitPrice: 120 },
      { priceBookId: priceBook.id, code: "EL-03", name: "ביטול שקע", categoryKey: "ELECTRICAL", changeType: "REMOVED", unit: "UNIT", unitPrice: 90 },
      { priceBookId: priceBook.id, code: "LT-01", name: "נקודת תאורה נוספת", categoryKey: "LIGHTING", changeType: "ADDED", unit: "POINT", unitPrice: 210 },
      { priceBookId: priceBook.id, code: "LT-02", name: "הזזת נקודת תאורה", categoryKey: "LIGHTING", changeType: "MOVED", unit: "POINT", unitPrice: 145 },
      { priceBookId: priceBook.id, code: "PL-01", name: "נקודת מים נוספת", categoryKey: "PLUMBING", changeType: "ADDED", unit: "POINT", unitPrice: 480 },
      { priceBookId: priceBook.id, code: "PL-02", name: "הזזת נקודת מים", categoryKey: "PLUMBING", changeType: "MOVED", unit: "POINT", unitPrice: 620 },
      { priceBookId: priceBook.id, code: "SN-01", name: "הזזת קבועה סניטרית", categoryKey: "SANITARY", changeType: "MOVED", unit: "UNIT", unitPrice: 1450 },
      { priceBookId: priceBook.id, code: "WL-01", name: "מחיצת גבס — למטר", categoryKey: "WALL", changeType: "ADDED", unit: "METER", unitPrice: 320 },
      { priceBookId: priceBook.id, code: "WL-02", name: "ביטול קיר בלוק — למטר", categoryKey: "WALL", changeType: "REMOVED", unit: "METER", unitPrice: 260 },
      { priceBookId: priceBook.id, code: "DR-01", name: "הזזת דלת", categoryKey: "DOOR", changeType: "MOVED", unit: "UNIT", unitPrice: 890 },
      { priceBookId: priceBook.id, code: "DR-02", name: "דלת נוספת", categoryKey: "DOOR", changeType: "ADDED", unit: "UNIT", unitPrice: 1750 },
      { priceBookId: priceBook.id, code: "HV-01", name: "הזזת מפזר מיזוג", categoryKey: "HVAC", changeType: "MOVED", unit: "UNIT", unitPrice: 540 },
      { priceBookId: priceBook.id, code: "CM-01", name: "נקודת תקשורת נוספת", categoryKey: "COMMUNICATION", changeType: "ADDED", unit: "POINT", unitPrice: 240 },
      { priceBookId: priceBook.id, code: "KT-01", name: "שינוי בארון מטבח", categoryKey: "KITCHEN", changeType: null, unit: "UNIT", unitPrice: 750 },
      { priceBookId: priceBook.id, code: "OT-01", name: "פריט בתמחור ידני", categoryKey: "OTHER", changeType: null, unit: "LUMP", unitPrice: 0 },
    ],
  });

  // -------------------------------------------------------------------------
  // תוכניות וגרסאות
  // -------------------------------------------------------------------------
  console.log("יוצר תוכניות, גרסאות ומערכות שינויים...");

  const standardDocument = standardApartment42();
  const modifiedDocument = modifiedApartment42();

  const { changeSetId } = await seedApartmentPlans({
    apartmentId: apartment42.id,
    standardDocument,
    modifiedDocument,
    designerId: users.noa.id,
    managerId: users.yael.id,
    uploadedAt: daysAgo(6),
    withCorrectionVersion: true,
  });

  // דירות נוספות עם מערכות שינויים — כדי שהמדדים במערכת יהיו אמיתיים
  const extraApartmentNumbers = ["27", "35", "18", "52", "23"];
  const extraChangeSets: { apartmentNumber: string; changeSetId: string }[] = [];

  for (const [index, number] of extraApartmentNumbers.entries()) {
    const apartment = await prisma.apartment.findFirst({
      where: { projectId: project.id, buildingId: buildingA.id, number },
    });
    if (!apartment) continue;

    const partial = partialModifiedDocument(standardDocument, modifiedDocument, 4 + index * 2);
    const result = await seedApartmentPlans({
      apartmentId: apartment.id,
      standardDocument,
      modifiedDocument: partial,
      designerId: users.noa.id,
      managerId: users.yael.id,
      uploadedAt: daysAgo(12 + index * 3),
      withCorrectionVersion: false,
    });
    extraChangeSets.push({ apartmentNumber: number, changeSetId: result.changeSetId });
  }

  await seedDecisions({
    changeSetId,
    apartmentId: apartment42.id,
    organizationId: service.id,
    projectId: project.id,
    users,
    priceBookId: priceBook.id,
  });

  await seedSecondaryWorkflow({
    organizationId: service.id,
    projectId: project.id,
    users,
    extraChangeSets,
  });

  await seedLearningData({ projectId: project.id, userId: users.yael.id, extraChangeSets });

  await seedAssignmentsAndNotifications({
    organizationId: service.id,
    projectId: project.id,
    apartmentId: apartment42.id,
    users,
  });

  console.log("\nנתוני ההדגמה נוצרו בהצלחה.");
  console.log(`  ארגון: ${service.name}`);
  console.log(`  פרויקטים: ${project.name}, ${secondProject.name}`);
  console.log(`  דירות: ${apartments.length}`);
  console.log("\n  כניסה להדגמה (DEMO_LOGIN_ENABLED=true):");
  console.log("    yael@oviax.demo   — מנהלת שינויי דיירים");
  console.log("    eyal@oviax.demo   — יועץ אינסטלציה");
  console.log("    dana@oviax.demo   — מנהלת פרויקט");
}

// ---------------------------------------------------------------------------

type SeededUsers = Awaited<ReturnType<typeof seedUsers>>;

async function seedUsers(serviceOrgId: string, developerOrgId: string) {
  async function createUser(
    name: string,
    email: string,
    role: UserRole,
    organizationId: string,
    jobTitle: string,
    isSuperAdmin = false,
  ) {
    const user = await prisma.user.create({
      data: { name, email, isSuperAdmin, emailVerified: daysAgo(60), title: jobTitle },
    });
    await prisma.organizationMember.create({
      data: { organizationId, userId: user.id, role, jobTitle },
    });
    return user;
  }

  const yael = await createUser(
    "יעל כהן",
    "yael@oviax.demo",
    "TENANT_CHANGE_MANAGER",
    serviceOrgId,
    "מנהלת שינויי דיירים",
  );
  const ronit = await createUser(
    "רונית אבידן",
    "ronit@oviax.demo",
    "TENANT_CHANGE_COORDINATOR",
    serviceOrgId,
    "מתאמת שינויי דיירים",
  );
  const dana = await createUser(
    "דנה שלו",
    "dana@oviax.demo",
    "PROJECT_MANAGER",
    serviceOrgId,
    "מנהלת פרויקט",
  );
  const noa = await createUser(
    "נועה ברק",
    "noa@oviax.demo",
    "DESIGNER",
    serviceOrgId,
    "מעצבת פנים",
  );
  const eyal = await createUser(
    "אייל רוזן",
    "eyal@oviax.demo",
    "PLUMBING_CONSULTANT",
    serviceOrgId,
    "יועץ אינסטלציה",
  );
  const uri = await createUser(
    "אורי גלעד",
    "uri@oviax.demo",
    "HVAC_CONSULTANT",
    serviceOrgId,
    "יועץ מיזוג אוויר",
  );
  const michal = await createUser(
    "מיכל ברנע",
    "michal@oviax.demo",
    "PRICING_MANAGER",
    serviceOrgId,
    "מנהלת תמחור",
  );
  const nir = await createUser(
    "ניר אלון",
    "nir@oviax.demo",
    "SUPER_ADMIN",
    serviceOrgId,
    "מנהל מערכת",
    true,
  );

  // אותה מנהלת שינויי דיירים מחוברת גם לארגון היזם — מודל ריבוי לקוחות
  await prisma.organizationMember.create({
    data: {
      organizationId: developerOrgId,
      userId: yael.id,
      role: "TENANT_CHANGE_MANAGER",
      jobTitle: "מנהלת שינויי דיירים מטעם אורבן",
    },
  });

  return { yael, ronit, dana, noa, eyal, uri, michal, nir };
}

/** יוצר תוכנית ביניים עם חלק מהשינויים בלבד — לדירות ההדגמה הנוספות */
function partialModifiedDocument(
  standard: DrawingDocument,
  modified: DrawingDocument,
  changeCount: number,
): DrawingDocument {
  const standardIds = new Set(standard.elements.map((element) => element.id));
  const addedIds = modified.elements
    .filter((element) => !standardIds.has(element.id))
    .map((element) => element.id);

  const keptAdded = new Set(addedIds.slice(0, Math.max(1, Math.floor(changeCount / 2))));

  const elements = modified.elements.filter((element) => {
    if (standardIds.has(element.id)) return true;
    return keptAdded.has(element.id);
  });

  // מחזירים גם חלק מהאלמנטים שבוטלו, כדי שההשוואה תהיה מגוונת
  const removed = standard.elements.filter(
    (element) => !modified.elements.some((candidate) => candidate.id === element.id),
  );
  const restored = changeCount % 3 === 0 ? removed : [];

  return { ...modified, elements: [...elements, ...restored] };
}

async function seedApartmentPlans(input: {
  apartmentId: string;
  standardDocument: DrawingDocument;
  modifiedDocument: DrawingDocument;
  designerId: string;
  managerId: string;
  uploadedAt: Date;
  withCorrectionVersion: boolean;
}) {
  const { createChangeSetFromVersions } = await import("../src/server/services/change-detection");

  const standardPlan = await prisma.plan.create({
    data: {
      apartmentId: input.apartmentId,
      kind: "STANDARD",
      title: "תוכנית סטנדרט",
    },
  });

  const standardVersion = await prisma.planVersion.create({
    data: {
      planId: standardPlan.id,
      versionNo: 1,
      title: "תוכנית סטנדרט — טיפוס 4 חדרים",
      status: "APPROVED",
      notes: "תוכנית המכר החתומה. מהווה בסיס להשוואה לכל השינויים.",
      isCurrent: true,
      approvedAt: daysAgo(90),
      createdAt: daysAgo(90),
      elements: input.standardDocument as unknown as Prisma.InputJsonValue,
    },
  });

  const modifiedPlan = await prisma.plan.create({
    data: {
      apartmentId: input.apartmentId,
      kind: "MODIFIED",
      title: "תוכנית שינויים",
    },
  });

  const designerVersion = await prisma.planVersion.create({
    data: {
      planId: modifiedPlan.id,
      versionNo: 2,
      title: "שינויי מעצבת",
      status: input.withCorrectionVersion ? "SUPERSEDED" : "IN_REVIEW",
      notes: "התוכנית שהתקבלה מהמעצבת לאחר פגישה עם הדייר.",
      authorId: input.designerId,
      isCurrent: !input.withCorrectionVersion,
      createdAt: input.uploadedAt,
      elements: input.modifiedDocument as unknown as Prisma.InputJsonValue,
    },
  });

  let currentVersion = designerVersion;

  if (input.withCorrectionVersion) {
    currentVersion = await prisma.planVersion.create({
      data: {
        planId: modifiedPlan.id,
        versionNo: 3,
        title: "תיקוני מנהלת שינויי דיירים",
        status: "IN_REVIEW",
        notes:
          "גרסה לאחר סבב הערות ראשון: תוקן סימון מחיצת הגבס והושלמו מידות בחדר הרחצה.",
        authorId: input.designerId,
        isCurrent: true,
        createdAt: daysAgo(2),
        elements: input.modifiedDocument as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const result = await createChangeSetFromVersions({
    apartmentId: input.apartmentId,
    baseVersionId: standardVersion.id,
    targetVersionId: currentVersion.id,
    userId: input.managerId,
    occurredAt: currentVersion.createdAt,
  });

  return {
    changeSetId: result.changeSet.id,
    standardVersionId: standardVersion.id,
    currentVersionId: currentVersion.id,
  };
}

/**
 * החלטות מקצועיות על דירה 42.
 * חלק מהשינויים נשארים בכוונה במצב "ממתין לבדיקה" כדי שניתן יהיה להריץ
 * את התהליך בפועל: אישור זיהוי, שליחה ליועץ ותמחור.
 */
async function seedDecisions(input: {
  changeSetId: string;
  apartmentId: string;
  organizationId: string;
  projectId: string;
  users: SeededUsers;
  priceBookId: string;
}) {
  const items = await prisma.changeItem.findMany({
    where: { changeSetId: input.changeSetId },
    orderBy: { code: "asc" },
  });

  // שינויים שנשארים לבדיקה חיה במסך: שקע אחד ושתי נקודות אינסטלציה
  const leaveForReview = new Set(["OUT-41", "SAN-01", "WTR-01"]);

  const review = await prisma.review.create({
    data: {
      apartmentId: input.apartmentId,
      changeSetId: input.changeSetId,
      reviewerId: input.users.yael.id,
      status: "IN_PROGRESS",
      summary: "בדיקת תוכנית השינויים מול תוכנית הסטנדרט של טיפוס 4 חדרים.",
      startedAt: daysAgo(2),
    },
  });

  for (const item of items) {
    if (leaveForReview.has(item.elementId ?? "")) continue;

    await prisma.changeItem.update({
      where: { id: item.id },
      data: {
        status: "CONFIRMED",
        decidedById: input.users.yael.id,
        decidedAt: daysAgo(1),
      },
    });

    await prisma.professionalDecision.create({
      data: {
        apartmentId: input.apartmentId,
        changeItemId: item.id,
        userId: input.users.yael.id,
        role: "TENANT_CHANGE_MANAGER",
        kind: "CHANGE_CONFIRMED",
        decision: "הזיהוי אושר",
        notes: "נבדק מול תוכנית הסטנדרט ומול דרישות הפרויקט.",
        createdAt: daysAgo(1),
      },
    });
  }

  await prisma.reviewComment.create({
    data: {
      reviewId: review.id,
      authorId: input.users.yael.id,
      body: "מחיצת הגבס בסלון סומנה ללא מידות. התקבלה גרסה מתוקנת מהמעצבת.",
      createdAt: daysAgo(2),
    },
  });

  await prisma.approval.createMany({
    data: [
      { apartmentId: input.apartmentId, kind: "MANAGER_REVIEW", status: "PENDING" },
      { apartmentId: input.apartmentId, kind: "CONSULTANT", status: "PENDING" },
      { apartmentId: input.apartmentId, kind: "PRICING", status: "PENDING" },
      { apartmentId: input.apartmentId, kind: "TENANT", status: "PENDING" },
    ],
  });

  // גיליון תמחור ראשוני מהשינויים שכבר אושרו
  const confirmed = await prisma.changeItem.findMany({
    where: { changeSetId: input.changeSetId, status: "CONFIRMED" },
    orderBy: { code: "asc" },
  });

  const priceBookItems = await prisma.priceBookItem.findMany({
    where: { priceBookId: input.priceBookId },
  });

  const { lines } = buildPricingLines(
    confirmed.map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      categoryKey: item.categoryKey,
      type: item.type,
      status: item.status,
      quantity: item.quantity,
      unit: item.unit,
      roomLabel: item.roomLabel,
    })),
    priceBookItems.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      categoryKey: item.categoryKey,
      changeType: item.changeType,
      unit: item.unit,
      unitPrice: item.unitPrice,
      vatBehavior: item.vatBehavior,
      isActive: item.isActive,
    })),
  );

  const sheet = await prisma.pricingSheet.create({
    data: {
      apartmentId: input.apartmentId,
      changeSetId: input.changeSetId,
      priceBookId: input.priceBookId,
      ownerId: input.users.michal.id,
      status: "DRAFT",
      vatRate: 18,
      notes: "טיוטה. יתעדכן לאחר קבלת אישור יועץ האינסטלציה לשני השינויים הפתוחים.",
    },
  });

  if (lines.length > 0) {
    await prisma.pricingLine.createMany({
      data: lines.map((line) => ({
        pricingSheetId: sheet.id,
        changeItemId: line.changeItemId,
        priceBookItemId: line.priceBookItemId,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        source: line.source,
        sortOrder: line.sortOrder,
      })),
    });
  }

  const activities: Array<[Date, string, ActivityKind]> = [
    [daysAgo(90), "נוצרה דירה 42 בבניין A, קומה 11", "APARTMENT_CREATED"],
    [daysAgo(90), "הועלתה תוכנית הסטנדרט של טיפוס 4 חדרים (גרסה 1)", "PLAN_UPLOADED"],
    [daysAgo(6), "נועה ברק העלתה את תוכנית השינויים (גרסה 2)", "VERSION_CREATED"],
    [daysAgo(4), "התוכנית הוחזרה לתיקון: חסרות מידות למחיצת הגבס בסלון", "CORRECTION_REQUESTED"],
    [daysAgo(2), "התקבלה גרסה 3 לאחר תיקוני מנהלת שינויי הדיירים", "VERSION_CREATED"],
    [daysAgo(1), "יעל כהן אישרה 14 זיהויי שינוי", "CHANGE_CONFIRMED"],
  ];

  for (const [createdAt, message, kind] of activities) {
    await prisma.activityLog.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        apartmentId: input.apartmentId,
        userId: input.users.yael.id,
        kind,
        message,
        createdAt,
      },
    });
  }
}

/** תהליכי יועצים, תיקונים ותמחור בדירות הנוספות */
async function seedSecondaryWorkflow(input: {
  organizationId: string;
  projectId: string;
  users: SeededUsers;
  extraChangeSets: { apartmentNumber: string; changeSetId: string }[];
}) {
  for (const entry of input.extraChangeSets) {
    const changeSet = await prisma.changeSet.findUniqueOrThrow({
      where: { id: entry.changeSetId },
      include: { apartment: true, items: { orderBy: { code: "asc" } } },
    });

    const apartmentId = changeSet.apartmentId;
    const items = changeSet.items;
    if (items.length === 0) continue;

    switch (entry.apartmentNumber) {
      // דירה 27 — נשלחה בקשה ליועץ וממתינה לתשובה
      case "27": {
        const target = items.find((item) => item.requiresConsultant) ?? items[0];
        await prisma.consultantRequest.create({
          data: {
            apartmentId,
            changeItemId: target.id,
            code: "CR-2041",
            kind: (target.consultantKind ?? "PLUMBING") as ConsultantKind,
            status: "PENDING",
            requestedById: input.users.yael.id,
            assigneeId: input.users.eyal.id,
            question: `${target.description}. נא לאשר את ההיתכנות מול מערכת האינסטלציה של הבניין.`,
            dueDate: daysAhead(3),
            createdAt: daysAgo(2),
          },
        });
        await prisma.changeItem.update({
          where: { id: target.id },
          data: { status: "AWAITING_CONSULTANT" },
        });
        await prisma.apartment.update({
          where: { id: apartmentId },
          data: { status: "AWAITING_CONSULTANT" },
        });
        break;
      }

      // דירה 35 — התקבלה תשובת יועץ
      case "35": {
        const target = items.find((item) => item.requiresConsultant) ?? items[0];
        const request = await prisma.consultantRequest.create({
          data: {
            apartmentId,
            changeItemId: target.id,
            code: "CR-2038",
            kind: (target.consultantKind ?? "PLUMBING") as ConsultantKind,
            status: "ANSWERED",
            requestedById: input.users.yael.id,
            assigneeId: input.users.eyal.id,
            question: `${target.description}. נדרשת בדיקת שיפועי ניקוז.`,
            createdAt: daysAgo(9),
          },
        });
        await prisma.consultantResponse.create({
          data: {
            requestId: request.id,
            responderId: input.users.eyal.id,
            decision: "APPROVED_WITH_CONDITIONS",
            conditions: "בכפוף להגבהת רצפה של 4 ס\"מ באזור המקלחת ולשמירה על שיפוע 1.5%.",
            notes: "נבדק מול תוכנית האינסטלציה של הקומה. אין התנגשות עם קו ראשי.",
            createdAt: daysAgo(7),
          },
        });
        await prisma.changeItem.update({
          where: { id: target.id },
          data: { status: "CONSULTANT_CONDITIONAL", decidedById: input.users.eyal.id, decidedAt: daysAgo(7) },
        });
        await prisma.professionalDecision.create({
          data: {
            apartmentId,
            changeItemId: target.id,
            userId: input.users.eyal.id,
            role: "PLUMBING_CONSULTANT",
            kind: "CONSULTANT_DECISION",
            decision: "מאושר בתנאים",
            notes: "בכפוף להגבהת רצפה ולשמירה על שיפוע.",
            createdAt: daysAgo(7),
          },
        });
        break;
      }

      // דירה 18 — התוכנית הוחזרה לתיקון
      case "18": {
        const review = await prisma.review.create({
          data: {
            apartmentId,
            changeSetId: changeSet.id,
            reviewerId: input.users.yael.id,
            status: "RETURNED_FOR_CORRECTION",
            summary: "התוכנית הוחזרה למעצבת להשלמת פרטים.",
            startedAt: daysAgo(5),
            completedAt: daysAgo(5),
          },
        });
        await prisma.reviewComment.create({
          data: {
            reviewId: review.id,
            authorId: input.users.yael.id,
            body: "חסר סימון של נקודת המים במטבח ואין מידות למחיצה החדשה.",
            isCorrectionRequest: true,
            createdAt: daysAgo(5),
          },
        });
        await prisma.apartment.update({
          where: { id: apartmentId },
          data: { status: "NEEDS_CORRECTION" },
        });
        break;
      }

      // דירה 52 — כל השינויים אושרו, ממתינה לתמחור
      case "52": {
        await prisma.changeItem.updateMany({
          where: { changeSetId: changeSet.id },
          data: { status: "CONFIRMED", decidedById: input.users.yael.id, decidedAt: daysAgo(3) },
        });
        await prisma.review.create({
          data: {
            apartmentId,
            changeSetId: changeSet.id,
            reviewerId: input.users.yael.id,
            status: "COMPLETED",
            summary: "הבדיקה הושלמה. כל השינויים אושרו והועברו לתמחור.",
            startedAt: daysAgo(4),
            completedAt: daysAgo(3),
          },
        });
        await prisma.apartment.update({
          where: { id: apartmentId },
          data: { status: "AWAITING_PRICING" },
        });
        break;
      }

      // דירה 23 — התמחור נשלח לדייר
      case "23": {
        await prisma.changeItem.updateMany({
          where: { changeSetId: changeSet.id },
          data: { status: "PRICED", decidedById: input.users.yael.id, decidedAt: daysAgo(8) },
        });
        const priceBook = await prisma.priceBook.findFirstOrThrow({
          where: { projectId: input.projectId },
          include: { items: true },
        });
        const sheet = await prisma.pricingSheet.create({
          data: {
            apartmentId,
            changeSetId: changeSet.id,
            priceBookId: priceBook.id,
            ownerId: input.users.michal.id,
            status: "SENT_TO_TENANT",
            vatRate: 18,
            sentAt: daysAgo(5),
          },
        });
        const { lines } = buildPricingLines(
          changeSet.items.map((item) => ({
            id: item.id,
            code: item.code,
            description: item.description,
            categoryKey: item.categoryKey,
            type: item.type,
            status: "CONFIRMED" as const,
            quantity: item.quantity,
            unit: item.unit,
            roomLabel: item.roomLabel,
          })),
          priceBook.items,
        );
        if (lines.length > 0) {
          await prisma.pricingLine.createMany({
            data: lines.map((line) => ({
              pricingSheetId: sheet.id,
              changeItemId: line.changeItemId,
              priceBookItemId: line.priceBookItemId,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              source: line.source,
              sortOrder: line.sortOrder,
            })),
          });
        }
        await prisma.apartment.update({
          where: { id: apartmentId },
          data: { status: "AWAITING_TENANT_APPROVAL" },
        });
        break;
      }
    }
  }
}

/** תיקוני זיהוי קודמים — הבסיס למרכז הלמידה */
async function seedLearningData(input: {
  projectId: string;
  userId: string;
  extraChangeSets: { apartmentNumber: string; changeSetId: string }[];
}) {
  const corrections: Array<{
    elementTypes: string[];
    predictedCategory: ChangeCategoryKey;
    notes: string;
  }> = [
    {
      elementTypes: ["OUTLET"],
      predictedCategory: "COMMUNICATION",
      notes: "הנקודה סווגה כתקשורת. בפועל מדובר בשקע חשמל רגיל.",
    },
    {
      elementTypes: ["WATER_POINT"],
      predictedCategory: "SANITARY",
      notes: "סווג כקבועה סניטרית. מדובר בנקודת מים בלבד.",
    },
    {
      elementTypes: ["PARTITION"],
      predictedCategory: "OTHER",
      notes: "המחיצה לא סווגה נכון בגלל סימון שכבה שגוי בקובץ המקור.",
    },
    {
      elementTypes: ["LIGHT"],
      predictedCategory: "ELECTRICAL",
      notes: "נקודת תאורה סווגה כנקודת חשמל.",
    },
  ];

  let correctionIndex = 0;

  for (const entry of input.extraChangeSets) {
    const items = await prisma.changeItem.findMany({
      where: { changeSetId: entry.changeSetId },
      orderBy: { code: "asc" },
    });

    for (const correction of corrections) {
      const item = items.find(
        (candidate) =>
          correction.elementTypes.includes(candidate.elementType) &&
          candidate.status === "DETECTED",
      );
      if (!item) continue;
      if (correctionIndex >= 8) break;

      await prisma.aITrainingCorrection.create({
        data: {
          changeItemId: item.id,
          projectId: input.projectId,
          correctedById: input.userId,
          predictedType: item.type,
          predictedCategory: correction.predictedCategory,
          correctedType: item.type,
          correctedCategory: item.categoryKey,
          originalConfidence: item.confidence,
          notes: correction.notes,
          context: { elementType: item.elementType, roomLabel: item.roomLabel },
          createdAt: daysAgo(10 + correctionIndex),
        },
      });

      await prisma.changeItem.update({
        where: { id: item.id },
        data: { status: "CONFIRMED", decidedById: input.userId, decidedAt: daysAgo(10) },
      });

      await prisma.professionalDecision.create({
        data: {
          apartmentId: (await prisma.changeSet.findUniqueOrThrow({ where: { id: entry.changeSetId } }))
            .apartmentId,
          changeItemId: item.id,
          userId: input.userId,
          role: "TENANT_CHANGE_MANAGER",
          kind: "CLASSIFICATION_CORRECTED",
          decision: "סיווג תוקן",
          notes: correction.notes,
          createdAt: daysAgo(10 + correctionIndex),
        },
      });

      correctionIndex += 1;
    }
  }
}

async function seedAssignmentsAndNotifications(input: {
  organizationId: string;
  projectId: string;
  apartmentId: string;
  users: SeededUsers;
}) {
  await prisma.professionalAssignment.createMany({
    data: [
      {
        projectId: input.projectId,
        apartmentId: input.apartmentId,
        assigneeId: input.users.yael.id,
        createdById: input.users.dana.id,
        kind: "PLAN_REVIEW",
        status: "IN_PROGRESS",
        title: "בדיקת תוכנית דירה 42",
        description: "השלמת בדיקת 17 השינויים והעברת שינויי האינסטלציה ליועץ.",
        dueDate: daysAhead(4),
      },
      {
        projectId: input.projectId,
        assigneeId: input.users.yael.id,
        createdById: input.users.dana.id,
        kind: "CONSULTANT_REVIEW",
        status: "OPEN",
        title: "מעקב אחר תשובת יועץ — דירה 27",
        description: "הבקשה נשלחה לפני יומיים ועדיין לא התקבלה תשובה.",
        dueDate: daysAhead(1),
      },
      {
        projectId: input.projectId,
        assigneeId: input.users.yael.id,
        createdById: input.users.dana.id,
        kind: "PRICING",
        status: "OPEN",
        title: "העברת דירה 52 לתמחור",
        description: "כל השינויים אושרו. ניתן להפיק גיליון תמחור.",
        dueDate: daysAhead(2),
      },
      {
        projectId: input.projectId,
        assigneeId: input.users.ronit.id,
        createdById: input.users.yael.id,
        kind: "CORRECTION",
        status: "OPEN",
        title: "מעקב תיקון תוכנית — דירה 18",
        description: "המעצבת התבקשה להשלים מידות ולסמן נקודת מים.",
        dueDate: daysAhead(3),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        organizationId: input.organizationId,
        userId: input.users.yael.id,
        apartmentId: input.apartmentId,
        kind: "REVIEW_REQUIRED",
        title: "דירה 42 ממתינה לבדיקה שלך",
        body: "התקבלה גרסה 3 עם 17 שינויים מול תוכנית הסטנדרט.",
        createdAt: daysAgo(2),
      },
      {
        organizationId: input.organizationId,
        userId: input.users.yael.id,
        kind: "CONSULTANT_ANSWERED",
        title: "יועץ האינסטלציה השיב לבקשה CR-2038",
        body: "דירה 35 — מאושר בתנאים.",
        createdAt: daysAgo(7),
      },
      {
        organizationId: input.organizationId,
        userId: input.users.yael.id,
        kind: "READY_FOR_PRICING",
        title: "דירה 52 מוכנה לתמחור",
        body: "כל השינויים אושרו בבדיקה המקצועית.",
        createdAt: daysAgo(3),
      },
      {
        organizationId: input.organizationId,
        userId: input.users.yael.id,
        kind: "CORRECTION_REQUIRED",
        title: "דירה 18 הוחזרה לתיקון",
        body: "המעצבת התבקשה להשלים מידות ולסמן נקודת מים.",
        readAt: daysAgo(4),
        createdAt: daysAgo(5),
      },
      {
        organizationId: input.organizationId,
        userId: input.users.eyal.id,
        kind: "CONSULTANT_REQUESTED",
        title: "בקשת יועץ חדשה — דירה 27",
        body: "התקבלה בקשה לבדיקת שינוי באינסטלציה.",
        createdAt: daysAgo(2),
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
