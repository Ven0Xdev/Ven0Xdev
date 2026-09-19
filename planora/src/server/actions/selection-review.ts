"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireApartmentAccess } from "@/lib/auth/session";
import { canDecideSelections } from "@/lib/auth/permissions";
import { notify, recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

async function loadSelection(selectionId: string) {
  return prisma.apartmentSelection.findUniqueOrThrow({
    where: { id: selectionId },
    include: {
      product: true,
      variant: true,
      apartment: {
        include: { project: { select: { id: true, organizationId: true } } },
      },
    },
  });
}

/**
 * הכרעה בבחירת מוצר של דייר.
 * הדייר בוחר — גורם מקצועי מורשה מאשר או דוחה.
 */
export async function decideSelection(input: {
  selectionId: string;
  decision: "APPROVED" | "REJECTED";
  notes?: string;
}): Promise<ActionResult> {
  const schema = z.object({
    selectionId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    notes: z.string().max(800).optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הפרטים אינם תקינים." };

  const selection = await loadSelection(parsed.data.selectionId);
  const { user, role } = await requireApartmentAccess(
    selection.apartmentId,
    "selection:decide",
  );

  if (!canDecideSelections(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול להכריע בבחירת דייר." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.apartmentSelection.update({
      where: { id: selection.id },
      data: {
        status: parsed.data.decision,
        decidedById: user.id,
        decidedAt: new Date(),
        notes: parsed.data.notes ?? selection.notes,
      },
    });

    await tx.professionalDecision.create({
      data: {
        apartmentId: selection.apartmentId,
        userId: user.id,
        role: role as UserRole,
        kind: parsed.data.decision === "APPROVED" ? "CHANGE_CONFIRMED" : "CHANGE_REJECTED",
        decision:
          parsed.data.decision === "APPROVED"
            ? `אושרה בחירת הדייר: ${selection.product.name}`
            : `נדחתה בחירת הדייר: ${selection.product.name}`,
        notes: parsed.data.notes,
      },
    });
  });

  await recordActivity({
    organizationId: selection.apartment.project.organizationId,
    projectId: selection.apartment.projectId,
    apartmentId: selection.apartmentId,
    userId: user.id,
    kind: parsed.data.decision === "APPROVED" ? "CHANGE_CONFIRMED" : "CHANGE_REJECTED",
    message: `${user.name} ${parsed.data.decision === "APPROVED" ? "אישרה" : "דחתה"} את בחירת הדייר: ${selection.product.name}`,
    metadata: { selectionId: selection.id },
  });

  if (selection.selectedById) {
    await notify({
      organizationId: selection.apartment.project.organizationId,
      userId: selection.selectedById,
      apartmentId: selection.apartmentId,
      kind: parsed.data.decision === "APPROVED" ? "TENANT_APPROVED" : "CORRECTION_REQUIRED",
      title:
        parsed.data.decision === "APPROVED"
          ? `הבחירה שלך אושרה: ${selection.product.name}`
          : `הבחירה ${selection.product.name} לא אושרה`,
      body: parsed.data.notes,
      href: "/tenant/apartment",
    });
  }

  revalidatePath(`/projects/${selection.apartment.projectId}/apartments/${selection.apartmentId}`);
  revalidatePath("/tenant", "layout");
  return {
    ok: true,
    message: parsed.data.decision === "APPROVED" ? "הבחירה אושרה." : "הבחירה נדחתה.",
  };
}

/**
 * פתיחת התצורה לעריכה מחדש על ידי הדייר.
 * הפעולה מתועדת — היא מבטלת נעילה שנוצרה בשליחה לבדיקה.
 */
export async function unlockConfiguration(apartmentId: string): Promise<ActionResult> {
  const { user, role } = await requireApartmentAccess(apartmentId, "selection:decide");

  if (!canDecideSelections(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לפתוח את התצורה לעריכה." };
  }

  const configuration = await prisma.apartmentConfiguration.findFirst({
    where: { apartmentId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    orderBy: { versionNo: "desc" },
  });

  if (!configuration) {
    return { ok: false, message: "אין תצורה נעולה לפתיחה." };
  }

  const apartment = await prisma.apartment.findUniqueOrThrow({
    where: { id: apartmentId },
    include: { project: { select: { organizationId: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.apartmentConfiguration.update({
      where: { id: configuration.id },
      data: { status: "DRAFT", lockedAt: null, submittedAt: null },
    });
    await tx.apartmentSelection.updateMany({
      where: { configurationId: configuration.id, status: "REQUESTED" },
      data: { status: "DRAFT" },
    });
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} פתחה את בחירות הדייר לעריכה מחדש`,
    metadata: { configurationId: configuration.id },
  });

  if (apartment.tenantUserId) {
    await notify({
      organizationId: apartment.project.organizationId,
      userId: apartment.tenantUserId,
      apartmentId,
      kind: "CORRECTION_REQUIRED",
      title: "הבחירות שלך נפתחו לעריכה",
      body: "אפשר לעדכן את הבחירות ולשלוח שוב לבדיקה.",
      href: "/tenant/apartment",
    });
  }

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartmentId}`);
  revalidatePath("/tenant", "layout");
  return { ok: true, message: "התצורה נפתחה לעריכה." };
}

const changeRequestDecisionSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["UNDER_REVIEW", "REQUIRES_CONSULTANT", "PRICED", "APPROVED", "REJECTED"]),
  notes: z.string().max(1500).optional(),
  estimatedPrice: z.number().min(0).optional(),
});

/** טיפול בבקשת שינוי של דייר */
export async function decideChangeRequest(input: {
  requestId: string;
  status: "UNDER_REVIEW" | "REQUIRES_CONSULTANT" | "PRICED" | "APPROVED" | "REJECTED";
  notes?: string;
  estimatedPrice?: number;
}): Promise<ActionResult> {
  const parsed = changeRequestDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הפרטים אינם תקינים." };

  const request = await prisma.changeRequest.findUniqueOrThrow({
    where: { id: parsed.data.requestId },
    include: { apartment: { include: { project: { select: { organizationId: true } } } } },
  });

  const { user } = await requireApartmentAccess(request.apartmentId, "request:handle");

  const isFinal = ["APPROVED", "REJECTED"].includes(parsed.data.status);

  await prisma.changeRequest.update({
    where: { id: request.id },
    data: {
      status: parsed.data.status,
      decisionNotes: parsed.data.notes,
      estimatedPrice: parsed.data.estimatedPrice ?? request.estimatedPrice,
      decidedAt: isFinal ? new Date() : null,
    },
  });

  await recordActivity({
    organizationId: request.apartment.project.organizationId,
    projectId: request.apartment.projectId,
    apartmentId: request.apartmentId,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} עדכנה את בקשת השינוי ${request.code}`,
    metadata: { changeRequestId: request.id, status: parsed.data.status },
  });

  if (request.tenantId) {
    await notify({
      organizationId: request.apartment.project.organizationId,
      userId: request.tenantId,
      apartmentId: request.apartmentId,
      kind: parsed.data.status === "PRICED" ? "PRICING_UPDATED" : "REVIEW_REQUIRED",
      title: `עדכון בבקשה ${request.code}`,
      body: parsed.data.notes,
      href: "/tenant/requests",
    });
  }

  revalidatePath(`/projects/${request.apartment.projectId}/apartments/${request.apartmentId}`);
  revalidatePath("/tenant", "layout");
  return { ok: true, message: "הבקשה עודכנה." };
}

const exceptionDecisionSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum([
    "UNDER_REVIEW",
    "SENT_TO_SUPPLIER",
    "MORE_INFO_REQUIRED",
    "APPROVED",
    "REJECTED",
  ]),
  notes: z.string().max(1500).optional(),
});

/**
 * טיפול בבקשה לאפשרות חריגה.
 * אישור חריג אינו מוסיף את המוצר לקטלוג — הוספה נעשית בנפרד ובמודע.
 */
export async function decideExceptionRequest(input: {
  requestId: string;
  status: "UNDER_REVIEW" | "SENT_TO_SUPPLIER" | "MORE_INFO_REQUIRED" | "APPROVED" | "REJECTED";
  notes?: string;
}): Promise<ActionResult> {
  const parsed = exceptionDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הפרטים אינם תקינים." };

  const request = await prisma.exceptionRequest.findUniqueOrThrow({
    where: { id: parsed.data.requestId },
    include: { apartment: { include: { project: { select: { organizationId: true } } } } },
  });

  const { user } = await requireApartmentAccess(request.apartmentId, "request:handle");

  const isFinal = ["APPROVED", "REJECTED"].includes(parsed.data.status);

  await prisma.exceptionRequest.update({
    where: { id: request.id },
    data: {
      status: parsed.data.status,
      decisionNotes: parsed.data.notes,
      decidedAt: isFinal ? new Date() : null,
    },
  });

  await recordActivity({
    organizationId: request.apartment.project.organizationId,
    projectId: request.apartment.projectId,
    apartmentId: request.apartmentId,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} עדכנה את הבקשה החריגה ${request.code}`,
    metadata: { exceptionRequestId: request.id, status: parsed.data.status },
  });

  if (request.tenantId) {
    await notify({
      organizationId: request.apartment.project.organizationId,
      userId: request.tenantId,
      apartmentId: request.apartmentId,
      kind: "REVIEW_REQUIRED",
      title: `עדכון בבקשה ${request.code}`,
      body: parsed.data.notes,
      href: "/tenant/requests",
    });
  }

  revalidatePath(`/projects/${request.apartment.projectId}/apartments/${request.apartmentId}`);
  revalidatePath("/tenant", "layout");
  return { ok: true, message: "הבקשה עודכנה." };
}
