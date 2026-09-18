"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireApartmentAccess } from "@/lib/auth/session";
import { buildPricingLines } from "@/lib/pricing/engine";
import { notifyRole, recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

async function loadApartment(apartmentId: string) {
  return prisma.apartment.findUniqueOrThrow({
    where: { id: apartmentId },
    include: { project: { select: { id: true, organizationId: true } } },
  });
}

/**
 * הפקה או רענון של גיליון התמחור מהשינויים המאושרים.
 * שורות שנערכו ידנית נשמרות ואינן נדרסות.
 */
export async function generatePricingSheet(apartmentId: string): Promise<ActionResult> {
  const apartment = await loadApartment(apartmentId);
  const { user } = await requireApartmentAccess(apartmentId, "pricing:manage");

  const changeSet = await prisma.changeSet.findFirst({
    where: { apartmentId },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { code: "asc" } } },
  });

  if (!changeSet) return { ok: false, message: "לא נמצאה רשימת שינויים לדירה זו." };

  const priceBook = await prisma.priceBook.findFirst({
    where: { projectId: apartment.projectId, isActive: true },
    include: { items: true },
  });

  if (!priceBook) {
    return { ok: false, message: "לא הוגדר מחירון לפרויקט. יש להגדיר מחירון לפני התמחור." };
  }

  const { lines, unmatched } = buildPricingLines(
    changeSet.items.map((item) => ({
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

  if (lines.length === 0) {
    return { ok: false, message: "אין עדיין שינויים מאושרים לתמחור." };
  }

  let sheet = await prisma.pricingSheet.findFirst({
    where: { apartmentId, status: { in: ["DRAFT", "SENT_TO_TENANT"] } },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });

  if (!sheet) {
    const created = await prisma.pricingSheet.create({
      data: {
        apartmentId,
        changeSetId: changeSet.id,
        priceBookId: priceBook.id,
        ownerId: user.id,
        vatRate: priceBook.vatRate,
      },
    });
    sheet = { ...created, lines: [] };
  }

  const existingByChangeItem = new Map(
    sheet.lines.filter((line) => line.changeItemId).map((line) => [line.changeItemId, line]),
  );

  for (const line of lines) {
    const existing = line.changeItemId
      ? existingByChangeItem.get(line.changeItemId)
      : undefined;

    if (!existing) {
      await prisma.pricingLine.create({
        data: {
          pricingSheetId: sheet.id,
          changeItemId: line.changeItemId,
          priceBookItemId: line.priceBookItemId,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          source: line.source,
          sortOrder: line.sortOrder,
        },
      });
      continue;
    }

    // שורה שנערכה ידנית אינה נדרסת ברענון
    if (existing.source === "AUTOMATIC") {
      await prisma.pricingLine.update({
        where: { id: existing.id },
        data: { quantity: line.quantity, unitPrice: line.unitPrice, unit: line.unit },
      });
    }
  }

  // הסרת שורות אוטומטיות שהשינוי שלהן כבר אינו מאושר
  const validChangeItemIds = new Set(lines.map((line) => line.changeItemId));
  await prisma.pricingLine.deleteMany({
    where: {
      pricingSheetId: sheet.id,
      source: "AUTOMATIC",
      changeItemId: { notIn: [...validChangeItemIds].filter((id): id is string => Boolean(id)) },
    },
  });

  await prisma.changeItem.updateMany({
    where: { changeSetId: changeSet.id, status: "CONFIRMED" },
    data: { status: "PRICED" },
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId,
    userId: user.id,
    kind: "PRICING_UPDATED",
    message: `${user.name} הפיקה תמחור לדירה ${apartment.number} (${lines.length} שורות)`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartmentId}`);
  revalidatePath("/pricing");

  return {
    ok: true,
    message:
      unmatched.length > 0
        ? `התמחור הופק. ${unmatched.length} שינויים ללא סעיף מחירון — נדרש תמחור ידני.`
        : "התמחור הופק בהצלחה.",
  };
}

const lineSchema = z.object({
  lineId: z.string().min(1),
  description: z.string().min(1).max(300),
  quantity: z.number().min(0).max(100000),
  unitPrice: z.number().min(0).max(10000000),
  changeReason: z.string().max(400).optional(),
});

export async function updatePricingLine(input: {
  lineId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  changeReason?: string;
}): Promise<ActionResult> {
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הערכים שהוזנו אינם תקינים." };

  const line = await prisma.pricingLine.findUniqueOrThrow({
    where: { id: parsed.data.lineId },
    include: { pricingSheet: { include: { apartment: true } } },
  });

  const { user } = await requireApartmentAccess(
    line.pricingSheet.apartmentId,
    "pricing:manage",
  );

  const changed =
    line.quantity !== parsed.data.quantity ||
    line.unitPrice !== parsed.data.unitPrice ||
    line.description !== parsed.data.description;

  await prisma.pricingLine.update({
    where: { id: line.id },
    data: {
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      changeReason: parsed.data.changeReason,
      source: changed && line.source === "AUTOMATIC" ? "EDITED" : line.source,
    },
  });

  const apartment = await loadApartment(line.pricingSheet.apartmentId);
  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "PRICING_UPDATED",
    message: `${user.name} עדכנה שורת תמחור: ${parsed.data.description}`,
    metadata: parsed.data.changeReason ? { reason: parsed.data.changeReason } : undefined,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "השורה עודכנה." };
}

export async function addManualPricingLine(input: {
  pricingSheetId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}): Promise<ActionResult> {
  const schema = z.object({
    pricingSheetId: z.string().min(1),
    description: z.string().min(1).max(300),
    quantity: z.number().min(0),
    unit: z.string().min(1).max(20),
    unitPrice: z.number().min(0),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "יש למלא תיאור, כמות ומחיר." };

  const sheet = await prisma.pricingSheet.findUniqueOrThrow({
    where: { id: parsed.data.pricingSheetId },
  });
  const { user } = await requireApartmentAccess(sheet.apartmentId, "pricing:manage");

  const count = await prisma.pricingLine.count({ where: { pricingSheetId: sheet.id } });

  await prisma.pricingLine.create({
    data: {
      pricingSheetId: sheet.id,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      unitPrice: parsed.data.unitPrice,
      source: "MANUAL",
      sortOrder: count,
    },
  });

  const apartment = await loadApartment(sheet.apartmentId);
  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "PRICING_UPDATED",
    message: `${user.name} הוסיפה שורת תמחור ידנית: ${parsed.data.description}`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "השורה נוספה." };
}

export async function removePricingLine(lineId: string): Promise<ActionResult> {
  const line = await prisma.pricingLine.findUniqueOrThrow({
    where: { id: lineId },
    include: { pricingSheet: true },
  });
  await requireApartmentAccess(line.pricingSheet.apartmentId, "pricing:manage");

  await prisma.pricingLine.delete({ where: { id: line.id } });

  const apartment = await loadApartment(line.pricingSheet.apartmentId);
  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "השורה הוסרה." };
}

export async function updatePricingSheet(input: {
  pricingSheetId: string;
  discount: number;
  notes?: string;
}): Promise<ActionResult> {
  const schema = z.object({
    pricingSheetId: z.string().min(1),
    discount: z.number().min(0),
    notes: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הערכים שהוזנו אינם תקינים." };

  const sheet = await prisma.pricingSheet.findUniqueOrThrow({
    where: { id: parsed.data.pricingSheetId },
  });
  await requireApartmentAccess(sheet.apartmentId, "pricing:manage");

  await prisma.pricingSheet.update({
    where: { id: sheet.id },
    data: { discount: parsed.data.discount, notes: parsed.data.notes },
  });

  const apartment = await loadApartment(sheet.apartmentId);
  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "התמחור עודכן." };
}

/** שליחת התמחור לאישור הדייר */
export async function sendPricingToTenant(pricingSheetId: string): Promise<ActionResult> {
  const sheet = await prisma.pricingSheet.findUniqueOrThrow({
    where: { id: pricingSheetId },
    include: { lines: true },
  });
  const { user } = await requireApartmentAccess(sheet.apartmentId, "pricing:manage");

  if (sheet.lines.length === 0) {
    return { ok: false, message: "לא ניתן לשלוח תמחור ריק." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.pricingSheet.update({
      where: { id: sheet.id },
      data: { status: "SENT_TO_TENANT", sentAt: new Date() },
    });
    await tx.apartment.update({
      where: { id: sheet.apartmentId },
      data: { status: "AWAITING_TENANT_APPROVAL" },
    });
    await tx.approval.updateMany({
      where: { apartmentId: sheet.apartmentId, kind: "PRICING", status: "PENDING" },
      data: { status: "GRANTED", grantedById: user.id, grantedAt: new Date() },
    });
  });

  const apartment = await loadApartment(sheet.apartmentId);
  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "PRICING_SENT",
    message: `התמחור של דירה ${apartment.number} נשלח לאישור הדייר`,
  });

  await notifyRole({
    organizationId: apartment.project.organizationId,
    roles: ["TENANT_CHANGE_MANAGER"],
    apartmentId: apartment.id,
    kind: "PRICING_UPDATED",
    title: `התמחור של דירה ${apartment.number} נשלח לדייר`,
    href: `/projects/${apartment.projectId}/apartments/${apartment.id}?tab=pricing`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  revalidatePath("/pricing");
  return { ok: true, message: "התמחור נשלח לאישור הדייר." };
}

/** רישום אישור הדייר */
export async function recordTenantApproval(pricingSheetId: string): Promise<ActionResult> {
  const sheet = await prisma.pricingSheet.findUniqueOrThrow({ where: { id: pricingSheetId } });
  const { user } = await requireApartmentAccess(sheet.apartmentId, "pricing:manage");

  await prisma.$transaction(async (tx) => {
    await tx.pricingSheet.update({
      where: { id: sheet.id },
      data: { status: "APPROVED_BY_TENANT", approvedAt: new Date() },
    });
    await tx.apartment.update({
      where: { id: sheet.apartmentId },
      data: { status: "AWAITING_PAYMENT" },
    });
    await tx.approval.updateMany({
      where: { apartmentId: sheet.apartmentId, kind: "TENANT", status: "PENDING" },
      data: { status: "GRANTED", grantedById: user.id, grantedAt: new Date() },
    });
  });

  const apartment = await loadApartment(sheet.apartmentId);
  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "TENANT_APPROVED",
    message: `הדייר אישר את התמחור של דירה ${apartment.number}`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "אישור הדייר נרשם." };
}

/** רישום תשלום */
export async function recordPayment(pricingSheetId: string): Promise<ActionResult> {
  const sheet = await prisma.pricingSheet.findUniqueOrThrow({ where: { id: pricingSheetId } });
  const { user } = await requireApartmentAccess(sheet.apartmentId, "payment:record");

  await prisma.$transaction(async (tx) => {
    await tx.pricingSheet.update({
      where: { id: sheet.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await tx.apartment.update({ where: { id: sheet.apartmentId }, data: { status: "PAID" } });
    await tx.approval.updateMany({
      where: { apartmentId: sheet.apartmentId, kind: "PAYMENT" },
      data: { status: "GRANTED", grantedById: user.id, grantedAt: new Date() },
    });
  });

  const apartment = await loadApartment(sheet.apartmentId);
  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "PAYMENT_RECEIVED",
    message: `התקבל תשלום עבור שינויי דירה ${apartment.number}`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartment.id}`);
  return { ok: true, message: "התשלום נרשם." };
}
