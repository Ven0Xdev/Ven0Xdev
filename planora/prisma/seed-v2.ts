/**
 * נתוני הדגמה של V2 — ספקים, קטלוגים, זמינות בפרויקט ודייר.
 *
 * הסקריפט אידמפוטנטי ואינו מוחק נתוני V1. אפשר להריץ אותו שוב ושוב,
 * וגם על בסיס נתונים קיים.
 */

import { PrismaClient } from "@prisma/client";
import type { MaterialCategory, SupplierCategory } from "@prisma/client";

const prisma = new PrismaClient();

interface VariantSpec {
  name: string;
  optionType: string;
  priceDelta?: number;
  color?: string;
  materialCategory?: MaterialCategory;
}

interface ProductSpec {
  sku: string;
  name: string;
  description: string;
  category: SupplierCategory;
  basePrice: number;
  /** מחיר השדרוג בפרויקט. 0 = כלול בסטנדרט */
  upgradePrice: number;
  includedInStandard?: boolean;
  requiresApproval?: boolean;
  requiresConsultant?: boolean;
  minimumRooms?: number;
  variants: VariantSpec[];
}

interface SupplierSpec {
  name: string;
  category: SupplierCategory;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  catalog: string;
  products: ProductSpec[];
}

const SUPPLIERS: SupplierSpec[] = [
  {
    name: "נובה מטבחים",
    category: "KITCHEN",
    description: "יצרן מטבחים בהתאמה אישית, עם ייצור בישראל וליווי מדידה עד הבית.",
    contactName: "שרון נובק",
    contactPhone: "03-6640220",
    contactEmail: "projects@nova-kitchens.demo",
    catalog: "קולקציית 2026",
    products: [
      {
        sku: "NV-LINEA",
        name: "מטבח Linea",
        description: "קו נקי, חזיתות ללא ידיות ומשטח עבודה בגימור מט.",
        category: "KITCHEN",
        basePrice: 0,
        upgradePrice: 0,
        includedInStandard: true,
        variants: [
          { name: "לבן מט", optionType: "חזית", color: "#f1f0ed", materialCategory: "CABINET_FRONT" },
          { name: "אפור בהיר", optionType: "חזית", color: "#d7d5d0", materialCategory: "CABINET_FRONT" },
          { name: "אלון טבעי", optionType: "חזית", priceDelta: 1800, color: "#c8a97e", materialCategory: "CABINET_FRONT" },
        ],
      },
      {
        sku: "NV-URBAN",
        name: "מטבח Urban",
        description: "חזיתות בגימור עמוק, אי מרכזי ומשטח קוורץ בעובי 2 ס\"מ.",
        category: "KITCHEN",
        basePrice: 38000,
        upgradePrice: 12400,
        variants: [
          { name: "גרפיט", optionType: "חזית", color: "#3c3f44", materialCategory: "CABINET_FRONT" },
          { name: "אלון כהה", optionType: "חזית", color: "#6b4f35", materialCategory: "CABINET_FRONT" },
          { name: "ירוק זית", optionType: "חזית", priceDelta: 900, color: "#55624f", materialCategory: "CABINET_FRONT" },
        ],
      },
      {
        sku: "NV-MILANO",
        name: "מטבח Milano",
        description: "קולקציית פרימיום: חזיתות ללא מסגרת, אי עם משטח אבן ותאורה משולבת.",
        category: "KITCHEN",
        basePrice: 62000,
        upgradePrice: 24800,
        requiresApproval: true,
        minimumRooms: 4,
        variants: [
          { name: "שחור מט", optionType: "חזית", color: "#25272b", materialCategory: "CABINET_FRONT" },
          { name: "לבן פרימיום", optionType: "חזית", color: "#f8f8f7", materialCategory: "CABINET_FRONT" },
        ],
      },
    ],
  },
  {
    name: "סטודיו קרמיקה",
    category: "FLOORING",
    description: "ייבוא ריצוף פורצלן וגרניט פורצלן, כולל פתרונות לחוץ.",
    contactName: "מירב לוגסי",
    contactPhone: "08-9770310",
    contactEmail: "info@ceramic-studio.demo",
    catalog: "ריצוף 2026",
    products: [
      {
        sku: "CS-STONE-80",
        name: "אבן 80×80",
        description: "גרניט פורצלן בגימור אבן טבעית, מידה 80×80 ס\"מ.",
        category: "FLOORING",
        basePrice: 0,
        upgradePrice: 0,
        includedInStandard: true,
        variants: [
          { name: "אבן בהירה", optionType: "גוון", color: "#ded8cd", materialCategory: "FLOOR" },
          { name: "אבן אפורה", optionType: "גוון", color: "#c2bfb9", materialCategory: "FLOOR" },
        ],
      },
      {
        sku: "CS-CONCRETE-120",
        name: "בטון 120×60",
        description: "מראה בטון אחיד, מידה 120×60 ס\"מ, מתאים לשטחים פתוחים.",
        category: "FLOORING",
        basePrice: 14000,
        upgradePrice: 4800,
        variants: [
          { name: "בטון בהיר", optionType: "גוון", color: "#cfcdc8", materialCategory: "FLOOR" },
          { name: "בטון כהה", optionType: "גוון", color: "#8e8c87", materialCategory: "FLOOR" },
        ],
      },
      {
        sku: "CS-OAK",
        name: "פרקט אלון",
        description: "פורצלן במראה עץ אלון, רוחב 20 ס\"מ, עמיד למים.",
        category: "FLOORING",
        basePrice: 17500,
        upgradePrice: 6200,
        variants: [
          { name: "אלון טבעי", optionType: "גוון", color: "#c9a97b", materialCategory: "FLOOR" },
          { name: "אלון מעושן", optionType: "גוון", color: "#8b6b48", materialCategory: "FLOOR" },
        ],
      },
      {
        sku: "CS-OUTDOOR-STD",
        name: "ריצוף חוץ סטנדרט",
        description: "אריח חוץ מונע החלקה למרפסת השמש.",
        category: "OUTDOOR",
        basePrice: 0,
        upgradePrice: 0,
        includedInStandard: true,
        variants: [
          { name: "אפור טבעי", optionType: "גוון", color: "#b8ada0", materialCategory: "OUTDOOR" },
        ],
      },
      {
        sku: "CS-DECK",
        name: "דק חוץ מתועש",
        description: "דק מתועש עמיד לשמש ולמים, כולל מסגרת היקפית.",
        category: "OUTDOOR",
        basePrice: 9800,
        upgradePrice: 3200,
        variants: [
          { name: "טיק", optionType: "גוון", color: "#9a6f45", materialCategory: "OUTDOOR" },
          { name: "אפור פחם", optionType: "גוון", color: "#5d5a55", materialCategory: "OUTDOOR" },
        ],
      },
    ],
  },
  {
    name: "Aqua Home",
    category: "SANITARY",
    description: "כלים סניטריים וברזים, כולל אחריות יצרן לעשר שנים.",
    contactName: "עדי שמש",
    contactPhone: "04-8112240",
    contactEmail: "service@aquahome.demo",
    catalog: "אמבט ומטבח 2026",
    products: [
      {
        sku: "AQ-TAP-STD",
        name: "ברז מטבח סטנדרט",
        description: "ברז פרח נשלף בגימור כרום.",
        category: "SANITARY",
        basePrice: 0,
        upgradePrice: 0,
        includedInStandard: true,
        variants: [{ name: "כרום", optionType: "גימור", color: "#c9ced4", materialCategory: "FIXTURE" }],
      },
      {
        sku: "AQ-TAP-BLACK",
        name: "ברז מטבח שחור מט",
        description: "ברז נשלף בגימור שחור מט, ראש כפול.",
        category: "SANITARY",
        basePrice: 2400,
        upgradePrice: 890,
        variants: [{ name: "שחור מט", optionType: "גימור", color: "#2b2d30", materialCategory: "FIXTURE" }],
      },
      {
        sku: "AQ-BASIN",
        name: "כיור מונח לחדר רחצה",
        description: "כיור אובלי מונח על משטח, קרמיקה מזוגגת.",
        category: "SANITARY",
        basePrice: 3600,
        upgradePrice: 1450,
        requiresConsultant: true,
        variants: [
          { name: "לבן", optionType: "גוון", color: "#fbfbfa", materialCategory: "FIXTURE" },
          { name: "אפור אבן", optionType: "גוון", priceDelta: 320, color: "#b6b3ad", materialCategory: "FIXTURE" },
        ],
      },
    ],
  },
  {
    name: "דלתות הרמוני",
    category: "DOORS",
    description: "דלתות פנים בייצור מקומי, כולל משקופים נסתרים.",
    contactName: "יניב אשד",
    contactPhone: "09-7442180",
    contactEmail: "sales@harmony-doors.demo",
    catalog: "דלתות פנים 2026",
    products: [
      {
        sku: "HD-STD",
        name: "דלת פנים לבנה",
        description: "דלת חלקה בגוון לבן, משקוף עץ.",
        category: "DOORS",
        basePrice: 0,
        upgradePrice: 0,
        includedInStandard: true,
        variants: [{ name: "לבן", optionType: "גוון", color: "#eeece7", materialCategory: "DOOR" }],
      },
      {
        sku: "HD-OAK",
        name: "דלת פנים אלון",
        description: "דלת בגימור אלון עם משקוף נסתר, לכל דלתות הדירה.",
        category: "DOORS",
        basePrice: 16800,
        upgradePrice: 5600,
        variants: [
          { name: "אלון טבעי", optionType: "גוון", color: "#c5a274", materialCategory: "DOOR" },
          { name: "אגוז", optionType: "גוון", color: "#7a5636", materialCategory: "DOOR" },
        ],
      },
    ],
  },
  {
    name: "אורלייט תאורה",
    category: "LIGHTING",
    description: "גופי תאורה שקועים ופתרונות תאורה לדירות מגורים.",
    contactName: "תמר בן שושן",
    contactPhone: "03-5510090",
    contactEmail: "hello@orlight.demo",
    catalog: "תאורה 2026",
    products: [
      {
        sku: "OL-STD",
        name: "גופי תאורה סטנדרט",
        description: "נקודות מאור בהתאם למפרט הטכני.",
        category: "LIGHTING",
        basePrice: 0,
        upgradePrice: 0,
        includedInStandard: true,
        variants: [],
      },
      {
        sku: "OL-RECESSED",
        name: "חבילת תאורה שקועה",
        description: "תאורה שקועה בסלון ובמטבח, כולל עמעם.",
        category: "LIGHTING",
        basePrice: 11000,
        upgradePrice: 3900,
        requiresApproval: true,
        variants: [
          { name: "אור חם", optionType: "גוון אור" },
          { name: "אור ניטרלי", optionType: "גוון אור" },
        ],
      },
    ],
  },
];

async function main() {
  console.log("טוען נתוני ספקים וקטלוגים...");

  const organization = await prisma.organization.findFirst({
    where: { type: "TENANT_CHANGE_SERVICE" },
  });
  const project = await prisma.project.findFirst({ where: { name: "פארק רזידנס" } });

  if (!organization || !project) {
    throw new Error("לא נמצאו נתוני V1. יש להריץ קודם: npm run db:seed");
  }

  const productsBySku = new Map<string, string>();
  const variantsByKey = new Map<string, string>();

  for (const spec of SUPPLIERS) {
    const supplier = await prisma.supplier.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: spec.name } },
      create: {
        organizationId: organization.id,
        name: spec.name,
        category: spec.category,
        description: spec.description,
        contactName: spec.contactName,
        contactPhone: spec.contactPhone,
        contactEmail: spec.contactEmail,
      },
      update: { description: spec.description, active: true },
    });

    const catalog = await prisma.catalog.upsert({
      where: { supplierId_name: { supplierId: supplier.id, name: spec.catalog } },
      create: { supplierId: supplier.id, name: spec.catalog, year: 2026 },
      update: {},
    });

    await prisma.projectSupplier.upsert({
      where: { projectId_supplierId: { projectId: project.id, supplierId: supplier.id } },
      create: {
        projectId: project.id,
        supplierId: supplier.id,
        defaultForCategory: true,
        notes: "ספק מאושר לפרויקט.",
      },
      update: { active: true },
    });

    for (const productSpec of spec.products) {
      const product = await prisma.catalogProduct.upsert({
        where: { supplierId_sku: { supplierId: supplier.id, sku: productSpec.sku } },
        create: {
          supplierId: supplier.id,
          catalogId: catalog.id,
          name: productSpec.name,
          description: productSpec.description,
          category: productSpec.category,
          sku: productSpec.sku,
          basePrice: productSpec.basePrice,
        },
        update: {
          name: productSpec.name,
          description: productSpec.description,
          basePrice: productSpec.basePrice,
          active: true,
        },
      });
      productsBySku.set(productSpec.sku, product.id);

      for (const [index, variantSpec] of productSpec.variants.entries()) {
        const existing = await prisma.productVariant.findFirst({
          where: { productId: product.id, name: variantSpec.name },
        });

        const variant = existing
          ? await prisma.productVariant.update({
              where: { id: existing.id },
              data: { priceDelta: variantSpec.priceDelta ?? 0, sortOrder: index, active: true },
            })
          : await prisma.productVariant.create({
              data: {
                productId: product.id,
                name: variantSpec.name,
                optionType: variantSpec.optionType,
                priceDelta: variantSpec.priceDelta ?? 0,
                sortOrder: index,
              },
            });

        variantsByKey.set(`${productSpec.sku}:${variantSpec.name}`, variant.id);

        // חומר לתצוגה התלת-ממדית — מקושר תמיד לווריאנט אמיתי
        if (variantSpec.color && variantSpec.materialCategory) {
          const existingMaterial = await prisma.materialDefinition.findFirst({
            where: { variantId: variant.id },
          });

          const materialData = {
            name: `${productSpec.name} · ${variantSpec.name}`,
            category: variantSpec.materialCategory,
            color: variantSpec.color,
            roughness: variantSpec.materialCategory === "FIXTURE" ? 0.25 : 0.7,
            metalness: variantSpec.materialCategory === "FIXTURE" ? 0.35 : 0,
            productId: product.id,
            variantId: variant.id,
          };

          if (existingMaterial) {
            await prisma.materialDefinition.update({
              where: { id: existingMaterial.id },
              data: materialData,
            });
          } else {
            await prisma.materialDefinition.create({ data: materialData });
          }
        }
      }

      // זמינות בפרויקט — שער הבקרה
      await prisma.projectProductAvailability.upsert({
        where: { projectId_productId: { projectId: project.id, productId: product.id } },
        create: {
          projectId: project.id,
          productId: product.id,
          available: true,
          includedInStandard: productSpec.includedInStandard ?? false,
          upgradePrice: productSpec.upgradePrice,
          requiresApproval: productSpec.requiresApproval ?? false,
          requiresConsultant: productSpec.requiresConsultant ?? false,
          minimumRooms: productSpec.minimumRooms ?? null,
        },
        update: {
          available: true,
          includedInStandard: productSpec.includedInStandard ?? false,
          upgradePrice: productSpec.upgradePrice,
          requiresApproval: productSpec.requiresApproval ?? false,
          requiresConsultant: productSpec.requiresConsultant ?? false,
          minimumRooms: productSpec.minimumRooms ?? null,
        },
      });
    }
  }

  await seedRecommendations(productsBySku);
  await seedPackages(project.id, productsBySku, variantsByKey);
  await seedCommercialTerms(project.id);
  await seedTenant(organization.id, project.id, productsBySku, variantsByKey);

  console.log("\nנתוני V2 נטענו בהצלחה.");
  console.log(`  ספקים: ${SUPPLIERS.length}`);
  console.log(`  מוצרים: ${productsBySku.size}`);
  console.log("\n  כניסת דייר להדגמה:");
  console.log("    noam@planora.demo   — נועם לוי, דירה 42");
}

async function seedRecommendations(products: Map<string, string>) {
  const links: [string, string, string][] = [
    ["NV-URBAN", "CS-CONCRETE-120", "ריצוף בטון משלים את חזיתות הגרפיט של מטבח Urban."],
    ["NV-URBAN", "AQ-TAP-BLACK", "ברז שחור מט בגימור תואם לחזית המטבח."],
    ["NV-MILANO", "AQ-BASIN", "כיור מונח משלים את קו העיצוב של קולקציית Milano."],
    ["NV-MILANO", "OL-RECESSED", "תאורה שקועה מדגישה את האי במטבח."],
    ["CS-OAK", "HD-OAK", "דלתות אלון בגוון תואם לריצוף."],
    ["CS-DECK", "OL-RECESSED", "תאורה שקועה משלימה את המרפסת."],
  ];

  for (const [index, [source, target, reason]] of links.entries()) {
    const sourceId = products.get(source);
    const targetId = products.get(target);
    if (!sourceId || !targetId) continue;

    await prisma.productRecommendation.upsert({
      where: { sourceProductId_targetProductId: { sourceProductId: sourceId, targetProductId: targetId } },
      create: { sourceProductId: sourceId, targetProductId: targetId, reason, sortOrder: index },
      update: { reason, active: true },
    });
  }
}

async function seedPackages(
  projectId: string,
  products: Map<string, string>,
  variants: Map<string, string>,
) {
  const packages: { name: string; description: string; items: [string, string | null][] }[] = [
    {
      name: "חבילת מטבח פרימיום",
      description: "מטבח Milano, ברז שחור מט וכיור מונח — קו עיצוב אחיד.",
      items: [
        ["NV-MILANO", "שחור מט"],
        ["AQ-TAP-BLACK", "שחור מט"],
        ["AQ-BASIN", "לבן"],
      ],
    },
    {
      name: "חבילת חדר רחצה",
      description: "כיור מונח וברז תואם לחדר הרחצה.",
      items: [
        ["AQ-BASIN", "אפור אבן"],
        ["AQ-TAP-BLACK", "שחור מט"],
      ],
    },
    {
      name: "חבילת תאורה",
      description: "תאורה שקועה בסלון ובמטבח, כולל עמעם.",
      items: [["OL-RECESSED", "אור חם"]],
    },
    {
      name: "חבילת מרפסת",
      description: "דק חוץ מתועש ותאורת מרפסת.",
      items: [["CS-DECK", "טיק"]],
    },
  ];

  for (const spec of packages) {
    const upgradePackage = await prisma.upgradePackage.upsert({
      where: { projectId_name: { projectId, name: spec.name } },
      create: { projectId, name: spec.name, description: spec.description },
      update: { description: spec.description, active: true },
    });

    for (const [sku, variantName] of spec.items) {
      const productId = products.get(sku);
      if (!productId) continue;

      await prisma.upgradePackageItem.upsert({
        where: { packageId_productId: { packageId: upgradePackage.id, productId } },
        create: {
          packageId: upgradePackage.id,
          productId,
          variantId: variantName ? (variants.get(`${sku}:${variantName}`) ?? null) : null,
        },
        update: {},
      });
    }
  }
}

async function seedCommercialTerms(projectId: string) {
  await prisma.projectCommercialTerms.upsert({
    where: { projectId },
    create: {
      projectId,
      setupFee: 40000,
      perApartmentFee: 750,
      majorChangesCommissionPercent: 5,
      majorChangeThreshold: 10000,
      notes: "מידע מסחרי פנימי. אינו מוצג לדייר בשום מסך.",
    },
    update: {},
  });
}

async function seedTenant(
  organizationId: string,
  projectId: string,
  products: Map<string, string>,
  variants: Map<string, string>,
) {
  const apartment = await prisma.apartment.findFirst({
    where: { projectId, number: "42", building: { name: "בניין A" } },
  });
  if (!apartment) return;

  const tenant = await prisma.user.upsert({
    where: { email: "noam@planora.demo" },
    create: {
      name: "נועם לוי",
      email: "noam@planora.demo",
      emailVerified: new Date(),
      title: "דייר",
    },
    update: {},
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: tenant.id } },
    create: { organizationId, userId: tenant.id, role: "TENANT", jobTitle: "דייר" },
    update: { role: "TENANT" },
  });

  await prisma.apartment.update({
    where: { id: apartment.id },
    data: { tenantUserId: tenant.id },
  });

  // מפרט הסטנדרט של הדירה
  const standard: [string, string | null, SupplierCategory][] = [
    ["NV-LINEA", "לבן מט", "KITCHEN"],
    ["CS-STONE-80", "אבן בהירה", "FLOORING"],
    ["CS-OUTDOOR-STD", "אפור טבעי", "OUTDOOR"],
    ["AQ-TAP-STD", "כרום", "SANITARY"],
    ["HD-STD", "לבן", "DOORS"],
    ["OL-STD", null, "LIGHTING"],
  ];

  for (const [sku, variantName, category] of standard) {
    const productId = products.get(sku);
    if (!productId) continue;

    await prisma.apartmentStandardPackage.upsert({
      where: {
        apartmentId_category_productId: { apartmentId: apartment.id, category, productId },
      },
      create: {
        apartmentId: apartment.id,
        productId,
        variantId: variantName ? (variants.get(`${sku}:${variantName}`) ?? null) : null,
        category,
        notes: "כלול במפרט הטכני של הדירה.",
      },
      update: {},
    });
  }

  // פרופיל נוף — תשתית בלבד
  await prisma.apartmentViewProfile.upsert({
    where: { apartmentId: apartment.id },
    create: {
      apartmentId: apartment.id,
      latitude: 31.9714,
      longitude: 34.7894,
      floorHeightM: 33,
      orientation: 275,
      viewType: "PARK",
      balconyDirection: 275,
      notes: "נתוני מיקום לשימוש עתידי בהדמיית נוף. אינם מיוצגים ויזואלית ב-V2.",
    },
    update: {},
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
