/**
 * פרויקט ההדגמה "Sea View Residence" — 40 דירות, דיירים אישיים ופורטל דיירים פעיל.
 *
 * הסקריפט אידמפוטנטי ואינו נוגע בפרויקטים קיימים.
 */

import { PrismaClient } from "@prisma/client";
import type { ApartmentStatus, SupplierCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

import { modifiedApartment42, standardApartment42 } from "../src/lib/drawing/demo/apartment-42";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "oviax2026";

const BUYERS = [
  "נועם לוי", "שירה אדרי", "איתי בן חיים", "מאיה פרידמן", "יונתן שרעבי",
  "טל אזולאי", "הילה מזרחי", "אורן דהן", "רותם ניסים", "עידן קסטן",
  "נטע הראל", "אסף גבאי", "ליאור עמר", "דנה שפירא", "גיא אלמוג",
  "עינב טולדנו", "רון בכר", "שקד ימיני", "אלון וקנין", "מיטל צור",
  "עומר סבן", "יערה בן דוד", "איתן פלד", "שני רוזנברג", "דור מלכה",
  "אביגיל שוורץ", "תום אבידור", "נועה קפלן", "ארז שמעוני", "רוני גולן",
  "יובל אשכנזי", "כרמל דיין", "אורי נחמיאס", "ליהי ברוך", "עידו שמריהו",
  "מור חדד", "בר לוינסון", "אדם יצחקי", "סתיו מועלם", "גל בן ארי",
];

/** דיירי ההדגמה שמקבלים חשבון אישי */
const DEMO_TENANTS = [
  { apartmentNumber: "18", name: "נועם לוי", email: "noam@oviax.demo" },
  { apartmentNumber: "12", name: "שירה אדרי", email: "shira@oviax.demo" },
  { apartmentNumber: "24", name: "איתי בן חיים", email: "itai@oviax.demo" },
  { apartmentNumber: "31", name: "מאיה פרידמן", email: "maya@oviax.demo" },
  { apartmentNumber: "7", name: "יונתן שרעבי", email: "yonatan@oviax.demo" },
];

function daysAhead(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

function daysAgo(days: number): Date {
  return daysAhead(-days);
}

async function main() {
  console.log("יוצר את פרויקט Sea View Residence...");

  const organization = await prisma.organization.findFirst({
    where: { type: "TENANT_CHANGE_SERVICE" },
  });
  if (!organization) throw new Error("לא נמצאו נתוני בסיס. יש להריץ קודם: npm run db:seed");

  const manager = await prisma.user.findFirst({ where: { email: "yael@oviax.demo" } });
  const coordinator = await prisma.user.findFirst({ where: { email: "ronit@oviax.demo" } });

  const project = await prisma.project.upsert({
    where: { id: (await prisma.project.findFirst({ where: { name: "Sea View Residence" } }))?.id ?? "new" },
    create: {
      organizationId: organization.id,
      name: "Sea View Residence",
      code: "SVR",
      developerName: "אלמוג נכסים",
      contractorName: "בנייה הדגמה",
      address: "טיילת הים 9",
      city: "בת ים",
      defaultViewType: "SEA",
      status: "TENANT_CHANGES",
      description: "40 דירות מול הים. שלב שינויי דיירים פתוח, עם פורטל אישי לכל דייר.",
      tenantChangeManagerId: manager?.id,
      changeDeadline: daysAhead(72),
      tenantChangesOpenDate: daysAgo(30),
      tenantChangesCloseDate: daysAhead(72),
      brandColor: "#1f4479",
      portalWelcomeText:
        "ברוכים הבאים לאזור האישי של הדירה שלכם. כאן תוכלו לראות את מצב הדירה, לבחור שדרוגים ולעקוב אחרי כל שלב בתהליך.",
      supportPhone: "03-5550140",
      supportEmail: "tenants@oviax.demo",
      supportHours: "ימים א'–ה', 09:00–17:00",
    },
    update: {
      tenantChangeManagerId: manager?.id,
      tenantChangesOpenDate: daysAgo(30),
      tenantChangesCloseDate: daysAhead(72),
      changeDeadline: daysAhead(72),
    },
  });

  const building = await prisma.building.upsert({
    where: { projectId_name: { projectId: project.id, name: "בניין B" } },
    create: { projectId: project.id, name: "בניין B", code: "B", floors: 14 },
    update: { floors: 14 },
  });

  const types = await Promise.all(
    [
      { name: "טיפוס 3 חדרים", rooms: 3, areaSqm: 84 },
      { name: "טיפוס 4 חדרים", rooms: 4, areaSqm: 106 },
      { name: "טיפוס 5 חדרים", rooms: 5, areaSqm: 132 },
    ].map((spec) =>
      prisma.apartmentType.upsert({
        where: { projectId_name: { projectId: project.id, name: spec.name } },
        create: { projectId: project.id, ...spec, balconies: 1 },
        update: {},
      }),
    ),
  );

  const statusCycle: ApartmentStatus[] = [
    "STANDARD",
    "CHANGES_IN_PROGRESS",
    "AWAITING_REVIEW",
    "STANDARD",
    "AWAITING_CONSULTANT",
    "AWAITING_PRICING",
    "STANDARD",
    "AWAITING_TENANT_APPROVAL",
    "PAID",
    "APPROVED_FOR_EXECUTION",
  ];

  console.log("יוצר 40 דירות...");
  const apartments: { id: string; number: string }[] = [];

  for (let index = 0; index < 40; index += 1) {
    const floorNumber = Math.floor(index / 3) + 1;
    const number = String(index + 1);

    const floor = await prisma.floor.upsert({
      where: { buildingId_number: { buildingId: building.id, number: floorNumber } },
      create: { buildingId: building.id, number: floorNumber, label: `קומה ${floorNumber}` },
      update: {},
    });

    const type = types[index % 3];

    const existing = await prisma.apartment.findFirst({
      where: { projectId: project.id, buildingId: building.id, number },
    });

    const data = {
      projectId: project.id,
      buildingId: building.id,
      floorId: floor.id,
      apartmentTypeId: type.id,
      number,
      buyerName: BUYERS[index],
      buyerContact: `05${2 + (index % 6)}-${String(2000000 + index * 5431).slice(0, 7)}`,
      status: statusCycle[index % statusCycle.length],
      assignedManagerId: manager?.id ?? null,
      assignedCoordinatorId: coordinator?.id ?? null,
      dueDate: daysAhead(12 + (index % 40)),
    };

    const apartment = existing
      ? await prisma.apartment.update({ where: { id: existing.id }, data })
      : await prisma.apartment.create({ data });

    // פרופיל הנוף — Sea View Residence בנתניה, החזית פונה מערבה אל הים.
    // דירות בחזית מקבלות נוף לים; העורפיות מקבלות נוף עירוני.
    // דירות ההדגמה של הדיירים פונות לים — הן החזית של הפרויקט
    const isDemoTenantApartment = DEMO_TENANTS.some(
      (tenant) => tenant.apartmentNumber === number,
    );
    const facesSea = isDemoTenantApartment || index % 3 !== 2;
    await prisma.apartmentViewProfile.upsert({
      where: { apartmentId: apartment.id },
      create: {
        apartmentId: apartment.id,
        viewType: facesSea ? "SEA" : "CITY",
        // גובה קומה אופייני 3 מ', והקומה הראשונה מוגבהת מעל הלובי
        floorHeightM: 1.5 + floorNumber * 3,
        orientation: facesSea ? 270 : 90,
        balconyDirection: facesSea ? 270 : 90,
        latitude: 32.0171,
        longitude: 34.7445,
        city: "בת ים",
      },
      update: {
        viewType: facesSea ? "SEA" : "CITY",
        floorHeightM: 1.5 + floorNumber * 3,
        orientation: facesSea ? 270 : 90,
        balconyDirection: facesSea ? 270 : 90,
        city: "בת ים",
      },
    });

    apartments.push({ id: apartment.id, number });
  }

  // מחירון ותנאים מסחריים
  const priceBook = await prisma.priceBook.findFirst({ where: { projectId: project.id } });
  if (!priceBook) {
    const source = await prisma.priceBook.findFirst({
      where: { project: { name: "פארק רזידנס" } },
      include: { items: true },
    });

    if (source) {
      const created = await prisma.priceBook.create({
        data: {
          organizationId: organization.id,
          projectId: project.id,
          name: "מחירון שינויי דיירים — Sea View Residence",
          vatRate: 18,
        },
      });
      await prisma.priceBookItem.createMany({
        data: source.items.map((item) => ({
          priceBookId: created.id,
          code: item.code,
          name: item.name,
          categoryKey: item.categoryKey,
          changeType: item.changeType,
          unit: item.unit,
          unitPrice: item.unitPrice,
        })),
      });
    }
  }

  await prisma.projectCommercialTerms.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      setupFee: 40000,
      perApartmentFee: 750,
      majorChangesCommissionPercent: 5,
      majorChangeThreshold: 10000,
      notes: "מידע מסחרי פנימי. אינו מוצג לדייר בשום מסך.",
    },
    update: {},
  });

  // חיבור ספקים וזמינות מוצרים — אותו קטלוג, פרויקט אחר
  const projectSuppliers = await prisma.supplier.findMany({
    where: { organizationId: organization.id, active: true },
    include: { products: true },
  });

  for (const supplier of projectSuppliers) {
    await prisma.projectSupplier.upsert({
      where: { projectId_supplierId: { projectId: project.id, supplierId: supplier.id } },
      create: { projectId: project.id, supplierId: supplier.id, defaultForCategory: true },
      update: { active: true },
    });

    for (const product of supplier.products) {
      const source = await prisma.projectProductAvailability.findFirst({
        where: { productId: product.id },
      });
      if (!source) continue;

      await prisma.projectProductAvailability.upsert({
        where: { projectId_productId: { projectId: project.id, productId: product.id } },
        create: {
          projectId: project.id,
          productId: product.id,
          available: true,
          includedInStandard: source.includedInStandard,
          upgradePrice: source.upgradePrice,
          requiresApproval: source.requiresApproval,
          requiresConsultant: source.requiresConsultant,
          minimumRooms: source.minimumRooms,
        },
        update: {},
      });
    }
  }

  await seedTenants(organization.id, project.id, apartments);
  await seedNoamState(project.id, apartments);

  console.log("\nפרויקט Sea View Residence מוכן.");
  console.log(`  דירות: ${apartments.length}`);
  console.log(`  דיירים עם חשבון אישי: ${DEMO_TENANTS.length}`);
  console.log("\n  כניסת דיירים (דואר אלקטרוני + סיסמה):");
  for (const tenant of DEMO_TENANTS) {
    console.log(`    ${tenant.email.padEnd(24)} סיסמה: ${DEMO_PASSWORD}  (דירה ${tenant.apartmentNumber})`);
  }
}

async function seedTenants(
  organizationId: string,
  projectId: string,
  apartments: { id: string; number: string }[],
) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const standardDocument = standardApartment42();
  const modifiedDocument = modifiedApartment42();

  for (const spec of DEMO_TENANTS) {
    const apartment = apartments.find((item) => item.number === spec.apartmentNumber);
    if (!apartment) continue;

    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        name: spec.name,
        email: spec.email,
        emailVerified: new Date(),
        title: "דייר",
        passwordHash,
      },
      update: { passwordHash, name: spec.name },
    });

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      create: { organizationId, userId: user.id, role: "TENANT", jobTitle: "דייר" },
      update: { role: "TENANT" },
    });

    // דייר ההדגמה שייך לדירה אחת. ניתוק קישורים קודמים מונע מצב שבו הוא
    // מקושר לשתי דירות ופורטל הדייר מציג את הדירה הלא נכונה.
    await prisma.apartment.updateMany({
      where: { tenantUserId: user.id, id: { not: apartment.id } },
      data: { tenantUserId: null },
    });

    await prisma.apartment.update({
      where: { id: apartment.id },
      data: { tenantUserId: user.id, buyerName: spec.name },
    });

    // תוכניות לדירה — בסיס לתצוגה הדו-ממדית והתלת-ממדית
    const hasPlan = await prisma.plan.findFirst({ where: { apartmentId: apartment.id } });
    if (!hasPlan) {
      const standardPlan = await prisma.plan.create({
        data: { apartmentId: apartment.id, kind: "STANDARD", title: "תוכנית סטנדרט" },
      });
      await prisma.planVersion.create({
        data: {
          planId: standardPlan.id,
          versionNo: 1,
          title: "תוכנית סטנדרט",
          status: "APPROVED",
          isCurrent: true,
          approvedAt: daysAgo(60),
          elements: standardDocument as never,
        },
      });

      // לדירה של נועם יש גם תוכנית שינויים, כדי שההשוואה תהיה אמיתית
      if (spec.apartmentNumber === "18") {
        const modifiedPlan = await prisma.plan.create({
          data: { apartmentId: apartment.id, kind: "MODIFIED", title: "תוכנית שינויים" },
        });
        await prisma.planVersion.create({
          data: {
            planId: modifiedPlan.id,
            versionNo: 2,
            title: "שינויי מעצבת",
            status: "IN_REVIEW",
            isCurrent: true,
            createdAt: daysAgo(5),
            elements: modifiedDocument as never,
          },
        });
      }
    }

    // מפרט הסטנדרט של הדירה
    const standardProducts = await prisma.projectProductAvailability.findMany({
      where: { projectId, includedInStandard: true },
      include: { product: { include: { variants: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
    });

    for (const entry of standardProducts) {
      await prisma.apartmentStandardPackage.upsert({
        where: {
          apartmentId_category_productId: {
            apartmentId: apartment.id,
            category: entry.product.category as SupplierCategory,
            productId: entry.productId,
          },
        },
        create: {
          apartmentId: apartment.id,
          productId: entry.productId,
          variantId: entry.product.variants[0]?.id ?? null,
          category: entry.product.category,
          notes: "כלול במפרט הטכני של הדירה.",
        },
        update: {},
      });
    }

    await prisma.apartmentViewProfile.upsert({
      where: { apartmentId: apartment.id },
      create: {
        apartmentId: apartment.id,
        latitude: 32.0167,
        longitude: 34.745,
        floorHeightM: 18,
        orientation: 270,
        viewType: "SEA",
        balconyDirection: 270,
        notes: "נתוני מיקום לשימוש עתידי בהדמיית נוף. אינם מיוצגים ויזואלית ב-V2.",
      },
      update: {},
    });
  }
}

/**
 * מצב ההדגמה של נועם (דירה 18): שני שינויים מאושרים, אחד ממתין ליועץ,
 * הצעת מחיר מוכנה ושלוש בחירות מוצר.
 */
async function seedNoamState(projectId: string, apartments: { id: string; number: string }[]) {
  const apartment = apartments.find((item) => item.number === "18");
  if (!apartment) return;

  const existing = await prisma.changeSet.findFirst({ where: { apartmentId: apartment.id } });
  if (existing) return;

  const { createChangeSetFromVersions } = await import("../src/server/services/change-detection");

  const versions = await prisma.planVersion.findMany({
    where: { plan: { apartmentId: apartment.id } },
    include: { plan: true },
    orderBy: { versionNo: "asc" },
  });

  const base = versions.find((version) => version.plan.kind === "STANDARD");
  const target = versions.find((version) => version.plan.kind === "MODIFIED");
  if (!base || !target) return;

  await prisma.changeCategory.createMany({
    data: (
      ["ELECTRICAL","LIGHTING","WALL","DOOR","WINDOW","PLUMBING","HVAC","KITCHEN","SANITARY","COMMUNICATION","OTHER"] as const
    ).map((key, index) => ({ projectId, key, label: key, sortOrder: index })),
    skipDuplicates: true,
  });

  const manager = await prisma.user.findFirst({ where: { email: "yael@oviax.demo" } });

  const { changeSet } = await createChangeSetFromVersions({
    apartmentId: apartment.id,
    baseVersionId: base.id,
    targetVersionId: target.id,
    userId: manager?.id ?? null,
    occurredAt: daysAgo(5),
  });

  const items = await prisma.changeItem.findMany({
    where: { changeSetId: changeSet.id },
    orderBy: { code: "asc" },
  });

  // שני שינויים מאושרים
  for (const item of items.filter((entry) => entry.categoryKey === "ELECTRICAL").slice(0, 2)) {
    await prisma.changeItem.update({
      where: { id: item.id },
      data: { status: "CONFIRMED", decidedById: manager?.id, decidedAt: daysAgo(3) },
    });
  }

  // שינוי אחד ממתין ליועץ
  const plumbing = items.find((entry) => entry.requiresConsultant);
  if (plumbing && manager) {
    await prisma.changeItem.update({
      where: { id: plumbing.id },
      data: { status: "AWAITING_CONSULTANT" },
    });
    const consultant = await prisma.user.findFirst({ where: { email: "eyal@oviax.demo" } });
    await prisma.consultantRequest.create({
      data: {
        apartmentId: apartment.id,
        changeItemId: plumbing.id,
        code: "CR-1801",
        kind: plumbing.consultantKind ?? "PLUMBING",
        status: "PENDING",
        requestedById: manager.id,
        assigneeId: consultant?.id,
        question: `${plumbing.description}. נא לאשר את ההיתכנות מול מערכת האינסטלציה של הבניין.`,
        dueDate: daysAhead(4),
        createdAt: daysAgo(2),
      },
    });
  }

  // הצעת מחיר מוכנה לאישור הדייר
  const priceBook = await prisma.priceBook.findFirst({
    where: { projectId },
    include: { items: true },
  });
  const pricingManager = await prisma.user.findFirst({ where: { email: "michal@oviax.demo" } });

  if (priceBook) {
    const confirmed = await prisma.changeItem.findMany({
      where: { changeSetId: changeSet.id, status: "CONFIRMED" },
    });

    const { buildPricingLines } = await import("../src/lib/pricing/engine");
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
      priceBook.items,
    );

    const sheet = await prisma.pricingSheet.create({
      data: {
        apartmentId: apartment.id,
        changeSetId: changeSet.id,
        priceBookId: priceBook.id,
        ownerId: pricingManager?.id,
        status: "SENT_TO_TENANT",
        vatRate: 18,
        sentAt: daysAgo(1),
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
  }

  await prisma.apartment.update({
    where: { id: apartment.id },
    data: { status: "AWAITING_TENANT_APPROVAL", paymentStatus: "PENDING" },
  });

  // שלוש בחירות מוצר של הדייר
  const tenant = await prisma.user.findFirst({ where: { email: "noam@oviax.demo" } });
  // בחירות שמשנות בפועל את מראה הדירה בתלת-ממד: מטבח, ריצוף וברז
  const demoSkus = ["NV-URBAN", "CS-CONCRETE-120", "AQ-TAP-BLACK"];
  const upgrades = await prisma.projectProductAvailability.findMany({
    where: {
      projectId,
      includedInStandard: false,
      available: true,
      product: { sku: { in: demoSkus } },
    },
    include: { product: { include: { variants: { orderBy: { sortOrder: "asc" } } } } },
  });

  if (tenant && upgrades.length > 0) {
    const configuration = await prisma.apartmentConfiguration.create({
      data: {
        apartmentId: apartment.id,
        versionNo: 1,
        label: "בחירות ראשונות",
        status: "DRAFT",
        createdById: tenant.id,
      },
    });

    // גוון כהה לכל בחירה, כדי שההבדל בתלת-ממד יהיה ברור
    const preferredVariant: Record<string, string> = {
      "NV-URBAN": "גרפיט",
      "CS-CONCRETE-120": "בטון כהה",
      "AQ-TAP-BLACK": "שחור מט",
    };

    for (const entry of upgrades) {
      const variant =
        entry.product.variants.find(
          (candidate) => candidate.name === preferredVariant[entry.product.sku],
        ) ?? entry.product.variants[0];
      await prisma.apartmentSelection.create({
        data: {
          apartmentId: apartment.id,
          configurationId: configuration.id,
          productId: entry.productId,
          variantId: variant?.id ?? null,
          category: entry.product.category,
          quantity: 1,
          price: entry.upgradePrice + (variant?.priceDelta ?? 0),
          status: "DRAFT",
          requiresApproval: entry.requiresApproval,
          requiresConsultant: entry.requiresConsultant,
          isMajorChange: entry.upgradePrice >= 10000,
          selectedById: tenant.id,
        },
      });
    }

    await prisma.notification.createMany({
      data: [
        {
          organizationId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).organizationId,
          userId: tenant.id,
          apartmentId: apartment.id,
          kind: "PRICING_UPDATED",
          title: "הצעת המחיר לשינויים שלך מוכנה",
          body: "אפשר לעבור על הפירוט ולאשר.",
          href: "/tenant/pricing",
          createdAt: daysAgo(1),
        },
        {
          organizationId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).organizationId,
          userId: tenant.id,
          apartmentId: apartment.id,
          kind: "CONSULTANT_REQUESTED",
          title: "אחד השינויים הועבר לבדיקת יועץ",
          body: "נעדכן אותך מיד עם קבלת התשובה.",
          createdAt: daysAgo(2),
        },
      ],
    });
  }
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
