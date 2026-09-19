import type { SupplierCategory } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  evaluateProductAvailability,
  TENANT_CATEGORY_ORDER,
  type EligibilityResult,
} from "@/lib/catalog/availability";
import { computeConfigurationPricing } from "@/lib/pricing/configuration";
import { recommendForSelections } from "@/lib/recommendations/engine";
import { toMaterialAssignment } from "@/lib/visualization/materials";
import { resolveViewType } from "@/lib/visualization/environment";
import type { ExteriorEnvironment, MaterialAssignment } from "@/lib/visualization/types";
import type { DrawingDocument } from "@/lib/drawing/types";

export interface TenantVariant {
  id: string;
  name: string;
  optionType: string;
  priceDelta: number;
  imageUrl: string | null;
  color: string | null;
}

export interface TenantProduct {
  id: string;
  name: string;
  description: string | null;
  category: SupplierCategory;
  supplierName: string;
  imageUrl: string | null;
  eligibility: EligibilityResult;
  variants: TenantVariant[];
  isStandard: boolean;
  selectedVariantId: string | null;
  selectionId: string | null;
  selectionStatus: string | null;
}

/**
 * טוען את כל מה שהמגדיר של הדייר צריך.
 *
 * מוצר נכנס לתוצאה רק אם הוא עבר את שער הזמינות של הפרויקט. מוצר שאינו
 * זמין אינו מוחזר כלל — לא כאפשרות מנוטרלת.
 */
export async function getTenantConfigurator(apartmentId: string) {
  const apartment = await prisma.apartment.findUniqueOrThrow({
    where: { id: apartmentId },
    include: {
      building: true,
      floor: true,
      apartmentType: true,
      project: {
        select: {
          id: true,
          name: true,
          developerName: true,
          changeDeadline: true,
          city: true,
          defaultViewType: true,
        },
      },
      plans: {
        include: { versions: { orderBy: { versionNo: "asc" } } },
      },
      standardPackages: {
        include: { product: { include: { supplier: true } }, variant: true },
      },
      viewProfile: true,
    },
  });

  const rooms = apartment.apartmentType?.rooms ?? null;

  const configuration = await prisma.apartmentConfiguration.findFirst({
    where: { apartmentId },
    orderBy: { versionNo: "desc" },
    include: {
      selections: {
        include: {
          product: { include: { supplier: true } },
          variant: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const availability = await prisma.projectProductAvailability.findMany({
    where: { projectId: apartment.projectId },
    include: {
      product: {
        include: {
          supplier: true,
          variants: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          materials: true,
        },
      },
    },
  });

  const selectionByProduct = new Map(
    (configuration?.selections ?? []).map((selection) => [selection.productId, selection]),
  );
  const standardProductIds = new Set(
    apartment.standardPackages.map((entry) => entry.productId),
  );

  const products: TenantProduct[] = [];

  for (const entry of availability) {
    if (!entry.product.active) continue;

    const eligibility = evaluateProductAvailability(entry, { rooms });
    if (eligibility.eligibility === "UNAVAILABLE") continue;

    const selection = selectionByProduct.get(entry.productId);

    products.push({
      id: entry.product.id,
      name: entry.product.name,
      description: entry.product.description,
      category: entry.product.category,
      supplierName: entry.product.supplier.name,
      imageUrl: entry.product.imageUrl,
      eligibility,
      isStandard: standardProductIds.has(entry.productId),
      selectedVariantId: selection?.variantId ?? null,
      selectionId: selection?.id ?? null,
      selectionStatus: selection?.status ?? null,
      variants: entry.product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        optionType: variant.optionType,
        priceDelta: variant.priceDelta,
        imageUrl: variant.imageUrl,
        color:
          entry.product.materials.find((material) => material.variantId === variant.id)?.color ??
          null,
      })),
    });
  }

  const categories = TENANT_CATEGORY_ORDER.filter((category) =>
    products.some((product) => product.category === category),
  );

  // --- המלצות ---
  const links = await prisma.productRecommendation.findMany({
    where: { active: true, sourceProductId: { in: [...selectionByProduct.keys()] } },
    orderBy: { sortOrder: "asc" },
  });

  const recommendations = recommendForSelections({
    selectedProductIds: [...selectionByProduct.keys()],
    links: links.map((link) => ({
      sourceProductId: link.sourceProductId,
      targetProductId: link.targetProductId,
      reason: link.reason,
      sortOrder: link.sortOrder,
    })),
    candidates: products.map((product) => ({
      productId: product.id,
      name: product.name,
      category: product.category,
      price: product.eligibility.price,
      imageUrl: product.imageUrl,
      selectable: true,
    })),
    limit: 4,
  });

  // --- תמחור ---
  const pricingSheet = await prisma.pricingSheet.findFirst({
    where: { apartmentId, status: { in: ["DRAFT", "SENT_TO_TENANT", "APPROVED_BY_TENANT", "PAID"] } },
    include: { lines: true },
    orderBy: { createdAt: "desc" },
  });

  const pricing = computeConfigurationPricing({
    selections: (configuration?.selections ?? []).map((selection) => ({
      id: selection.id,
      category: selection.category,
      productName: selection.product.name,
      variantName: selection.variant?.name ?? null,
      quantity: selection.quantity,
      price: selection.price,
      status: selection.status,
    })),
    professionalChanges: (pricingSheet?.lines ?? []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
    vatRate: pricingSheet?.vatRate ?? 18,
    includeDrafts: true,
  });

  // --- חומרים לתצוגה התלת-ממדית ---
  const materials: MaterialAssignment[] = [];
  for (const selection of configuration?.selections ?? []) {
    const productMaterials = await prisma.materialDefinition.findMany({
      where: {
        OR: [
          selection.variantId ? { variantId: selection.variantId } : { id: "__none__" },
          { productId: selection.productId, variantId: null },
        ],
      },
    });

    for (const material of productMaterials) {
      const assignment = toMaterialAssignment(
        material,
        `${selection.product.name}${selection.variant ? ` · ${selection.variant.name}` : ""}`,
      );
      if (assignment) materials.push(assignment);
    }
  }

  const standardPlan = apartment.plans.find((plan) => plan.kind === "STANDARD");
  const modifiedPlan = apartment.plans.find((plan) => plan.kind === "MODIFIED");
  const currentVersion =
    modifiedPlan?.versions.filter((version) => version.isCurrent).at(-1) ??
    standardPlan?.versions.at(-1);

  // --- הנוף מסביב לדירה ---
  // פרופיל הדירה גובר על ברירת המחדל של הפרויקט. גובה הקומה נגזר מהקומה
  // עצמה כאשר לא הוזן במפורש, כדי שדירה בקומה 6 לא תוצג בגובה הקרקע.
  const viewProfile = apartment.viewProfile;
  const environment: ExteriorEnvironment | null =
    viewProfile || apartment.project.defaultViewType
      ? {
          viewType: resolveViewType(
            viewProfile?.viewType,
            apartment.project.defaultViewType,
          ),
          floorHeightM:
            viewProfile?.floorHeightM ??
            (apartment.floor ? apartment.floor.number * 3 : null),
          orientation: viewProfile?.orientation ?? null,
          balconyDirection: viewProfile?.balconyDirection ?? null,
          latitude: viewProfile?.latitude ?? null,
          longitude: viewProfile?.longitude ?? null,
        }
      : null;

  return {
    apartment,
    configuration,
    products,
    categories,
    recommendations,
    pricing,
    materials,
    environment,
    document: (currentVersion?.elements as unknown as DrawingDocument | null) ?? null,
  };
}

export type TenantConfiguratorData = Awaited<ReturnType<typeof getTenantConfigurator>>;

/** סיכום קצר ללוח הבית של הדייר */
export async function getTenantOverview(apartmentId: string) {
  const [apartment, configuration, changeRequests, exceptionRequests] = await Promise.all([
    prisma.apartment.findUniqueOrThrow({
      where: { id: apartmentId },
      include: {
        building: true,
        floor: true,
        apartmentType: true,
        project: {
          select: {
            id: true,
            name: true,
            changeDeadline: true,
            tenantChangesOpenDate: true,
            tenantChangesCloseDate: true,
            portalWelcomeText: true,
            brandColor: true,
            supportPhone: true,
            supportEmail: true,
            supportHours: true,
            developerName: true,
          },
        },
        assignedManager: { select: { name: true } },
      },
    }),
    prisma.apartmentConfiguration.findFirst({
      where: { apartmentId },
      orderBy: { versionNo: "desc" },
      include: { selections: { include: { product: true, variant: true } } },
    }),
    prisma.changeRequest.findMany({
      where: { apartmentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.exceptionRequest.findMany({
      where: { apartmentId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { apartment, configuration, changeRequests, exceptionRequests };
}

/**
 * כל מה שדרוש למסך הסקירה של הדייר, כולל מצב התהליך.
 * השינויים המקצועיים מוצגים ללא נתוני זיהוי פנימיים.
 */
export async function getTenantJourneyData(apartmentId: string) {
  const [overview, pricingSheet, changeSet] = await Promise.all([
    getTenantOverview(apartmentId),
    prisma.pricingSheet.findFirst({
      where: { apartmentId, status: { in: ["SENT_TO_TENANT", "APPROVED_BY_TENANT", "PAID"] } },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.changeSet.findFirst({
      where: { apartmentId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { code: "asc" },
          include: { consultantRequests: { select: { status: true }, take: 1 } },
        },
      },
    }),
  ]);

  return { ...overview, pricingSheet, changeSet };
}

/** התראות אישיות של הדייר */
export async function getTenantNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** מסמכים שהדייר רשאי לראות */
export async function getTenantDocuments(apartmentId: string) {
  const [versions, pricingSheets, approvals] = await Promise.all([
    prisma.planVersion.findMany({
      where: { plan: { apartmentId }, status: { in: ["APPROVED", "IN_REVIEW", "SUBMITTED"] } },
      include: { plan: { select: { kind: true } }, drawingFiles: true },
      orderBy: { versionNo: "desc" },
    }),
    prisma.pricingSheet.findMany({
      where: { apartmentId, status: { in: ["SENT_TO_TENANT", "APPROVED_BY_TENANT", "PAID"] } },
      include: { lines: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.approval.findMany({
      where: { apartmentId, status: "GRANTED" },
      orderBy: { grantedAt: "desc" },
    }),
  ]);

  return { versions, pricingSheets, approvals };
}
