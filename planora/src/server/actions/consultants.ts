"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ConsultantDecision, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireApartmentAccess } from "@/lib/auth/session";
import { isConsultantRole } from "@/lib/auth/permissions";
import { notify, recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

const DECISIONS = ["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED", "MORE_INFO_REQUIRED"] as const;

const responseSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(DECISIONS),
  conditions: z.string().max(1000).optional(),
  notes: z.string().max(1500).optional(),
});

const ITEM_STATUS_BY_DECISION = {
  APPROVED: "CONSULTANT_APPROVED",
  APPROVED_WITH_CONDITIONS: "CONSULTANT_CONDITIONAL",
  REJECTED: "CONSULTANT_REJECTED",
  MORE_INFO_REQUIRED: "AWAITING_CONSULTANT",
} as const;

/**
 * תשובת יועץ.
 * רק בעל תפקיד יועץ (או מנהל מערכת) רשאי להשיב — זו החלטה מקצועית מתועדת.
 */
export async function respondToConsultantRequest(input: {
  requestId: string;
  decision: ConsultantDecision;
  conditions?: string;
  notes?: string;
}): Promise<ActionResult> {
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "יש לבחור החלטה תקינה." };
  }

  const request = await prisma.consultantRequest.findUniqueOrThrow({
    where: { id: parsed.data.requestId },
    include: {
      apartment: { include: { project: { select: { id: true, organizationId: true } } } },
      changeItem: true,
    },
  });

  const { user, role } = await requireApartmentAccess(request.apartmentId, "consultant:respond");

  if (!isConsultantRole(role) && role !== "SUPER_ADMIN") {
    return { ok: false, message: "רק יועץ מורשה יכול להשיב לבקשה." };
  }

  const isFinal = parsed.data.decision !== "MORE_INFO_REQUIRED";

  await prisma.$transaction(async (tx) => {
    await tx.consultantResponse.create({
      data: {
        requestId: request.id,
        responderId: user.id,
        decision: parsed.data.decision,
        conditions: parsed.data.conditions,
        notes: parsed.data.notes,
      },
    });

    await tx.consultantRequest.update({
      where: { id: request.id },
      data: { status: isFinal ? "ANSWERED" : "PENDING" },
    });

    if (request.changeItemId) {
      await tx.changeItem.update({
        where: { id: request.changeItemId },
        data: {
          status: ITEM_STATUS_BY_DECISION[parsed.data.decision],
          decidedById: user.id,
          decidedAt: new Date(),
        },
      });
    }

    await tx.professionalDecision.create({
      data: {
        apartmentId: request.apartmentId,
        changeItemId: request.changeItemId,
        planVersionId: request.planVersionId,
        userId: user.id,
        role: role as UserRole,
        kind: "CONSULTANT_DECISION",
        decision: parsed.data.decision,
        notes: [parsed.data.conditions, parsed.data.notes].filter(Boolean).join(" · ") || null,
      },
    });
  });

  await notify({
    organizationId: request.apartment.project.organizationId,
    userId: request.requestedById,
    apartmentId: request.apartmentId,
    kind: "CONSULTANT_ANSWERED",
    title: `התקבלה תשובת יועץ לבקשה ${request.code}`,
    body: `דירה ${request.apartment.number}`,
    href: `/projects/${request.apartment.projectId}/apartments/${request.apartmentId}?tab=consultants`,
  });

  await recordActivity({
    organizationId: request.apartment.project.organizationId,
    projectId: request.apartment.projectId,
    apartmentId: request.apartmentId,
    userId: user.id,
    kind: "CONSULTANT_ANSWERED",
    message: `${user.name} השיב לבקשה ${request.code}`,
    metadata: { requestId: request.id, decision: parsed.data.decision },
  });

  revalidatePath(`/projects/${request.apartment.projectId}/apartments/${request.apartmentId}`);
  revalidatePath("/consultants");
  return { ok: true, message: "התשובה נשמרה." };
}

/**
 * תשובת הדגמה — מדמה קבלת מענה מהיועץ כדי שניתן יהיה להריץ את התהליך
 * מקצה לקצה. פעיל רק בסביבת הדגמה, והתשובה נרשמת על שם היועץ האמיתי.
 */
export async function simulateConsultantResponse(requestId: string): Promise<ActionResult> {
  if (process.env.DEMO_LOGIN_ENABLED !== "true") {
    return { ok: false, message: "הפעולה זמינה בסביבת הדגמה בלבד." };
  }

  const request = await prisma.consultantRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      apartment: { include: { project: { select: { id: true, organizationId: true } } } },
    },
  });

  await requireApartmentAccess(request.apartmentId, "change:sendToConsultant");

  const consultant = request.assigneeId
    ? await prisma.user.findUnique({ where: { id: request.assigneeId } })
    : await prisma.user.findFirst({
        where: {
          memberships: {
            some: {
              organizationId: request.apartment.project.organizationId,
              role: "PLUMBING_CONSULTANT",
            },
          },
        },
      });

  if (!consultant) {
    return { ok: false, message: "לא נמצא יועץ מתאים לבקשה." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.consultantResponse.create({
      data: {
        requestId: request.id,
        responderId: consultant.id,
        decision: "APPROVED_WITH_CONDITIONS",
        conditions: "בכפוף לשמירה על שיפוע ניקוז של 1.5% ולבדיקת אטימות לפני יציקה.",
        notes: "נבדק מול תוכנית האינסטלציה של הקומה. אין התנגשות עם קו ראשי.",
      },
    });

    await tx.consultantRequest.update({
      where: { id: request.id },
      data: { status: "ANSWERED" },
    });

    if (request.changeItemId) {
      await tx.changeItem.update({
        where: { id: request.changeItemId },
        data: {
          status: "CONSULTANT_CONDITIONAL",
          decidedById: consultant.id,
          decidedAt: new Date(),
        },
      });
    }

    await tx.professionalDecision.create({
      data: {
        apartmentId: request.apartmentId,
        changeItemId: request.changeItemId,
        userId: consultant.id,
        role: "PLUMBING_CONSULTANT",
        kind: "CONSULTANT_DECISION",
        decision: "APPROVED_WITH_CONDITIONS",
        notes: "מאושר בתנאים",
      },
    });
  });

  await recordActivity({
    organizationId: request.apartment.project.organizationId,
    projectId: request.apartment.projectId,
    apartmentId: request.apartmentId,
    userId: consultant.id,
    kind: "CONSULTANT_ANSWERED",
    message: `${consultant.name} אישר בתנאים את הבקשה ${request.code}`,
    metadata: { requestId: request.id },
  });

  revalidatePath(`/projects/${request.apartment.projectId}/apartments/${request.apartmentId}`);
  revalidatePath("/consultants");
  return { ok: true, message: "התקבלה תשובת היועץ." };
}
