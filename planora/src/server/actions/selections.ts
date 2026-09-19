"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireTenantApartment } from "@/lib/auth/tenant";
import {
  evaluateProductAvailability,
  isQuantityAllowed,
  selectionPrice,
} from "@/lib/catalog/availability";
import { evaluateMajorChange } from "@/lib/commercial/terms";
import { notifyRole, recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

const TENANT_PATH = "/tenant";

/** יוצר או מחזיר את גרסת התצורה הפתוחה לעריכה */
async function ensureDraftConfiguration(
  apartmentId: string,
  userId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const existing = await tx.apartmentConfiguration.findFirst({
    where: { apartmentId, status: "DRAFT" },
    orderBy: { versionNo: "desc" },
  });
  if (existing) return existing;

  const last = await tx.apartmentConfiguration.findFirst({
    where: { apartmentId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });

  const versionNo = (last?.versionNo ?? 0) + 1;

  return tx.apartmentConfiguration.create({
    data: {
      apartmentId,
      versionNo,
      label: versionNo === 1 ? "בחירות ראשונות" : `גרסה ${versionNo}`,
      status: "DRAFT",
      createdById: userId,
    },
  });
}

const selectSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  quantity: z.number().min(1).max(999).optional(),
});

/**
 * בחירת מוצר על ידי הדייר.
 *
 * הבחירה נבדקת מול שער הזמינות בצד השרת. מוצר שאינו מאושר לפרויקט או
 * שאינו מתאים לטיפוס הדירה נדחה — גם אם נשלח ישירות ל-API.
 */
export async function selectProduct(input: {
  productId: string;
  variantId?: string | null;
  quantity?: number;
}): Promise<ActionResult> {
  const parsed = selectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הבחירה אינה תקינה." };

  const { user, apartment } = await requireTenantApartment();

  const availability = await prisma.projectProductAvailability.findUnique({
    where: {
      projectId_productId: { projectId: apartment.projectId, productId: parsed.data.productId },
    },
    include: { product: { include: { variants: true } } },
  });

  const eligibility = evaluateProductAvailability(availability, { rooms: apartment.rooms });
  if (!availability || eligibility.eligibility === "UNAVAILABLE") {
    return { ok: false, message: "המוצר אינו זמין בדירה זו." };
  }

  const quantity = parsed.data.quantity ?? 1;
  if (!isQuantityAllowed(eligibility, quantity)) {
    return {
      ok: false,
      message: `הכמות המרבית לפריט זה היא ${eligibility.maximumQuantity}.`,
    };
  }

  const variant = parsed.data.variantId
    ? availability.product.variants.find((item) => item.id === parsed.data.variantId)
    : null;

  if (parsed.data.variantId && !variant) {
    return { ok: false, message: "האפשרות שנבחרה אינה קיימת." };
  }

  const price = selectionPrice(eligibility, variant?.priceDelta ?? 0, quantity);

  const terms = await prisma.projectCommercialTerms.findUnique({
    where: { projectId: apartment.projectId },
  });

  const major = evaluateMajorChange({
    value: price,
    threshold: terms?.majorChangeThreshold ?? 0,
    supplierCategory: availability.product.category,
  });

  const configuration = await ensureDraftConfiguration(apartment.id, user.id);

  // בחירה אחת בלבד לכל קטגוריה — בחירה חדשה מחליפה את הקודמת
  await prisma.apartmentSelection.deleteMany({
    where: {
      configurationId: configuration.id,
      category: availability.product.category,
      status: "DRAFT",
      NOT: { productId: availability.productId },
    },
  });

  await prisma.apartmentSelection.upsert({
    where: {
      configurationId_category_productId: {
        configurationId: configuration.id,
        category: availability.product.category,
        productId: availability.productId,
      },
    },
    create: {
      apartmentId: apartment.id,
      configurationId: configuration.id,
      productId: availability.productId,
      variantId: variant?.id ?? null,
      category: availability.product.category,
      quantity,
      price,
      status: "DRAFT",
      requiresApproval: eligibility.requiresApproval,
      requiresConsultant: eligibility.requiresConsultant,
      isMajorChange: major.isMajor,
      selectedById: user.id,
    },
    update: {
      variantId: variant?.id ?? null,
      quantity,
      price,
      requiresApproval: eligibility.requiresApproval,
      requiresConsultant: eligibility.requiresConsultant,
      isMajorChange: major.isMajor,
      selectedById: user.id,
      selectedAt: new Date(),
    },
  });

  revalidatePath(TENANT_PATH, "layout");
  return { ok: true, message: "הבחירה נשמרה." };
}

export async function removeSelection(selectionId: string): Promise<ActionResult> {
  const { apartment } = await requireTenantApartment();

  const selection = await prisma.apartmentSelection.findFirst({
    where: { id: selectionId, apartmentId: apartment.id },
  });

  if (!selection) return { ok: false, message: "הבחירה לא נמצאה." };
  if (selection.status !== "DRAFT") {
    return { ok: false, message: "לא ניתן להסיר בחירה שכבר נשלחה לבדיקה." };
  }

  await prisma.apartmentSelection.delete({ where: { id: selection.id } });

  revalidatePath(TENANT_PATH, "layout");
  return { ok: true, message: "הבחירה הוסרה." };
}

/**
 * שליחת התצורה לבדיקה מקצועית.
 * לאחר השליחה הגרסה ננעלת חלקית — הדייר אינו יכול לשנות אותה יותר.
 */
export async function submitConfiguration(): Promise<ActionResult> {
  const { user, apartment } = await requireTenantApartment();

  const configuration = await prisma.apartmentConfiguration.findFirst({
    where: { apartmentId: apartment.id, status: "DRAFT" },
    orderBy: { versionNo: "desc" },
    include: { selections: true },
  });

  if (!configuration || configuration.selections.length === 0) {
    return { ok: false, message: "לא נבחרו עדיין פריטים לשליחה." };
  }

  const fullApartment = await prisma.apartment.findUniqueOrThrow({
    where: { id: apartment.id },
    include: { project: { select: { organizationId: true, name: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.apartmentConfiguration.update({
      where: { id: configuration.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), lockedAt: new Date() },
    });

    await tx.apartmentSelection.updateMany({
      where: { configurationId: configuration.id, status: "DRAFT" },
      data: { status: "REQUESTED" },
    });
  });

  await recordActivity({
    organizationId: fullApartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} שלח את בחירות הדירה לבדיקה (${configuration.selections.length} פריטים)`,
    metadata: { configurationId: configuration.id },
  });

  await notifyRole({
    organizationId: fullApartment.project.organizationId,
    roles: ["TENANT_CHANGE_MANAGER"],
    apartmentId: apartment.id,
    kind: "REVIEW_REQUIRED",
    title: `הדייר בדירה ${apartment.number} שלח בחירות לבדיקה`,
    body: `${configuration.selections.length} פריטים ממתינים לבדיקה מקצועית.`,
    href: `/projects/${apartment.projectId}/apartments/${apartment.id}?tab=selections`,
  });

  revalidatePath(TENANT_PATH, "layout");
  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "הבחירות נשלחו לבדיקה." };
}
