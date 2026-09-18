"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChangeCategoryKey, ChangeType, ConsultantKind, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireApartmentAccess } from "@/lib/auth/session";
import { can, hasProfessionalAuthority } from "@/lib/auth/permissions";
import { notify, recordActivity } from "@/server/services/activity";

const CATEGORY_KEYS = [
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
] as const;

const CHANGE_TYPES = ["ADDED", "REMOVED", "MOVED", "MODIFIED", "UNKNOWN"] as const;
const CONSULTANT_KINDS = [
  "PLUMBING",
  "HVAC",
  "ELECTRICAL",
  "STRUCTURAL",
  "ARCHITECT",
  "OTHER",
] as const;

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function loadChangeItem(changeItemId: string) {
  return prisma.changeItem.findUniqueOrThrow({
    where: { id: changeItemId },
    include: {
      changeSet: {
        include: {
          apartment: {
            include: { project: { select: { id: true, organizationId: true } } },
          },
        },
      },
    },
  });
}

function apartmentPath(projectId: string, apartmentId: string) {
  return `/projects/${projectId}/apartments/${apartmentId}`;
}

/**
 * אישור זיהוי שינוי.
 * רק תפקיד בעל סמכות מקצועית רשאי לבצע זאת — המערכת ממליצה, האדם מחליט.
 */
export async function confirmChangeItem(changeItemId: string): Promise<ActionResult> {
  const item = await loadChangeItem(changeItemId);
  const apartment = item.changeSet.apartment;
  const { user, role } = await requireApartmentAccess(apartment.id, "change:decide");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לאשר זיהוי שינוי." };
  }

  await prisma.changeItem.update({
    where: { id: item.id },
    data: { status: "CONFIRMED", decidedById: user.id, decidedAt: new Date() },
  });

  await prisma.professionalDecision.create({
    data: {
      apartmentId: apartment.id,
      changeItemId: item.id,
      userId: user.id,
      role: role as UserRole,
      kind: "CHANGE_CONFIRMED",
      decision: "הזיהוי אושר",
    },
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "CHANGE_CONFIRMED",
    message: `${user.name} אישרה את זיהוי השינוי ${item.code}: ${item.description}`,
    metadata: { changeItemId: item.id },
  });

  revalidatePath(apartmentPath(apartment.projectId, apartment.id));
  return { ok: true, message: "הזיהוי אושר." };
}

const correctionSchema = z.object({
  changeItemId: z.string().min(1),
  type: z.enum(CHANGE_TYPES),
  categoryKey: z.enum(CATEGORY_KEYS),
  notes: z.string().max(600).optional(),
});

/**
 * תיקון סיווג שינוי.
 * התיקון נשמר גם כרשומת למידה — בלי אימון אוטומטי בזמן אמת.
 */
export async function correctChangeItem(input: {
  changeItemId: string;
  type: ChangeType;
  categoryKey: ChangeCategoryKey;
  notes?: string;
}): Promise<ActionResult> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "הפרטים שהוזנו אינם תקינים." };
  }

  const item = await loadChangeItem(parsed.data.changeItemId);
  const apartment = item.changeSet.apartment;
  const { user, role } = await requireApartmentAccess(apartment.id, "change:decide");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לתקן סיווג." };
  }

  const isUnchanged =
    item.type === parsed.data.type && item.categoryKey === parsed.data.categoryKey;

  await prisma.$transaction(async (tx) => {
    await tx.changeItem.update({
      where: { id: item.id },
      data: {
        type: parsed.data.type,
        categoryKey: parsed.data.categoryKey,
        status: "CONFIRMED",
        decidedById: user.id,
        decidedAt: new Date(),
        notes: parsed.data.notes ?? item.notes,
      },
    });

    if (!isUnchanged) {
      await tx.aITrainingCorrection.create({
        data: {
          changeItemId: item.id,
          projectId: apartment.projectId,
          correctedById: user.id,
          predictedType: item.type,
          predictedCategory: item.categoryKey,
          correctedType: parsed.data.type,
          correctedCategory: parsed.data.categoryKey,
          originalConfidence: item.confidence,
          notes: parsed.data.notes,
          context: {
            elementType: item.elementType,
            roomLabel: item.roomLabel,
            code: item.code,
          },
        },
      });
    }

    await tx.professionalDecision.create({
      data: {
        apartmentId: apartment.id,
        changeItemId: item.id,
        userId: user.id,
        role: role as UserRole,
        kind: isUnchanged ? "CHANGE_CONFIRMED" : "CLASSIFICATION_CORRECTED",
        decision: isUnchanged ? "הזיהוי אושר" : "הסיווג תוקן",
        notes: parsed.data.notes,
      },
    });
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: isUnchanged ? "CHANGE_CONFIRMED" : "CHANGE_CORRECTED",
    message: isUnchanged
      ? `${user.name} אישרה את זיהוי השינוי ${item.code}`
      : `${user.name} תיקנה את סיווג השינוי ${item.code}`,
    metadata: { changeItemId: item.id },
  });

  revalidatePath(apartmentPath(apartment.projectId, apartment.id));
  return { ok: true, message: isUnchanged ? "הזיהוי אושר." : "הסיווג תוקן ונשמר." };
}

/** סימון "לא מדובר בשינוי" — טעות זיהוי */
export async function dismissChangeItem(
  changeItemId: string,
  notes?: string,
): Promise<ActionResult> {
  const item = await loadChangeItem(changeItemId);
  const apartment = item.changeSet.apartment;
  const { user, role } = await requireApartmentAccess(apartment.id, "change:decide");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לסמן שאין מדובר בשינוי." };
  }

  await prisma.changeItem.update({
    where: { id: item.id },
    data: { status: "DISMISSED", decidedById: user.id, decidedAt: new Date(), notes },
  });

  await prisma.professionalDecision.create({
    data: {
      apartmentId: apartment.id,
      changeItemId: item.id,
      userId: user.id,
      role: role as UserRole,
      kind: "CHANGE_DISMISSED",
      decision: "לא מדובר בשינוי",
      notes,
    },
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "CHANGE_DISMISSED",
    message: `${user.name} סימנה את ${item.code} כזיהוי שגוי`,
    metadata: { changeItemId: item.id },
  });

  revalidatePath(apartmentPath(apartment.projectId, apartment.id));
  return { ok: true, message: "השינוי סומן כזיהוי שגוי." };
}

/** דחיית שינוי — השינוי זוהה נכון אך לא יבוצע */
export async function rejectChangeItem(
  changeItemId: string,
  notes?: string,
): Promise<ActionResult> {
  const item = await loadChangeItem(changeItemId);
  const apartment = item.changeSet.apartment;
  const { user, role } = await requireApartmentAccess(apartment.id, "change:decide");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לדחות שינוי." };
  }

  await prisma.changeItem.update({
    where: { id: item.id },
    data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date(), notes },
  });

  await prisma.professionalDecision.create({
    data: {
      apartmentId: apartment.id,
      changeItemId: item.id,
      userId: user.id,
      role: role as UserRole,
      kind: "CHANGE_REJECTED",
      decision: "השינוי נדחה",
      notes,
    },
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "CHANGE_REJECTED",
    message: `${user.name} דחתה את השינוי ${item.code}`,
    metadata: { changeItemId: item.id },
  });

  revalidatePath(apartmentPath(apartment.projectId, apartment.id));
  return { ok: true, message: "השינוי נדחה." };
}

/** הוספת הערה לשינוי */
export async function addChangeNote(
  changeItemId: string,
  body: string,
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, message: "לא הוזן טקסט." };

  const item = await loadChangeItem(changeItemId);
  const apartment = item.changeSet.apartment;
  const { user, role } = await requireApartmentAccess(apartment.id, "change:comment");

  if (!can(role, "change:comment")) {
    return { ok: false, message: "אין לך הרשאה להוסיף הערה." };
  }

  let review = await prisma.review.findFirst({
    where: { apartmentId: apartment.id, changeSetId: item.changeSetId },
    orderBy: { createdAt: "desc" },
  });

  if (!review) {
    review = await prisma.review.create({
      data: {
        apartmentId: apartment.id,
        changeSetId: item.changeSetId,
        reviewerId: user.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  }

  await prisma.reviewComment.create({
    data: { reviewId: review.id, changeItemId: item.id, authorId: user.id, body: trimmed },
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} הוסיפה הערה לשינוי ${item.code}`,
    metadata: { changeItemId: item.id },
  });

  revalidatePath(apartmentPath(apartment.projectId, apartment.id));
  return { ok: true, message: "ההערה נוספה." };
}

const consultantRequestSchema = z.object({
  changeItemId: z.string().min(1),
  kind: z.enum(CONSULTANT_KINDS),
  question: z.string().min(5).max(1500),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});

/** שליחת שינוי ליועץ */
export async function sendChangeToConsultant(input: {
  changeItemId: string;
  kind: ConsultantKind;
  question: string;
  assigneeId?: string;
  dueDate?: string;
}): Promise<ActionResult> {
  const parsed = consultantRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "יש להזין שאלה ליועץ ולבחור סוג יועץ." };
  }

  const item = await loadChangeItem(parsed.data.changeItemId);
  const apartment = item.changeSet.apartment;
  const { user } = await requireApartmentAccess(apartment.id, "change:sendToConsultant");

  const existingCount = await prisma.consultantRequest.count({
    where: { apartmentId: apartment.id },
  });

  const request = await prisma.consultantRequest.create({
    data: {
      apartmentId: apartment.id,
      changeItemId: item.id,
      planVersionId: item.changeSet.targetVersionId,
      code: `CR-${apartment.number}${String(existingCount + 1).padStart(2, "0")}`,
      kind: parsed.data.kind,
      status: "PENDING",
      requestedById: user.id,
      assigneeId: parsed.data.assigneeId || null,
      question: parsed.data.question.trim(),
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  await prisma.changeItem.update({
    where: { id: item.id },
    data: { status: "AWAITING_CONSULTANT" },
  });

  await prisma.professionalDecision.create({
    data: {
      apartmentId: apartment.id,
      changeItemId: item.id,
      userId: user.id,
      role: "TENANT_CHANGE_MANAGER",
      kind: "SENT_TO_CONSULTANT",
      decision: "הועבר ליועץ",
      notes: parsed.data.question,
    },
  });

  if (parsed.data.assigneeId) {
    await notify({
      organizationId: apartment.project.organizationId,
      userId: parsed.data.assigneeId,
      apartmentId: apartment.id,
      kind: "CONSULTANT_REQUESTED",
      title: `בקשת יועץ חדשה — דירה ${apartment.number}`,
      body: parsed.data.question.slice(0, 160),
      href: `/consultants`,
    });
  }

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "CONSULTANT_REQUESTED",
    message: `${user.name} העבירה את השינוי ${item.code} לבדיקת יועץ (${request.code})`,
    metadata: { changeItemId: item.id, requestId: request.id },
  });

  revalidatePath(apartmentPath(apartment.projectId, apartment.id));
  revalidatePath("/consultants");
  return { ok: true, message: `הבקשה ${request.code} נשלחה ליועץ.` };
}
