"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireApartmentAccess } from "@/lib/auth/session";
import { hasProfessionalAuthority } from "@/lib/auth/permissions";
import { notifyRole, recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

async function loadApartment(apartmentId: string) {
  return prisma.apartment.findUniqueOrThrow({
    where: { id: apartmentId },
    include: { project: { select: { id: true, organizationId: true } } },
  });
}

/**
 * סיום בדיקה מקצועית והעברה לתמחור.
 * לא ניתן לסיים בדיקה כאשר קיימים שינויים שטרם הוכרעו או ממתינים ליועץ.
 */
export async function completeReviewAndMoveToPricing(
  apartmentId: string,
): Promise<ActionResult> {
  const apartment = await loadApartment(apartmentId);
  const { user, role } = await requireApartmentAccess(apartmentId, "review:perform");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לסיים את הבדיקה." };
  }

  const changeSet = await prisma.changeSet.findFirst({
    where: { apartmentId },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  if (!changeSet) {
    return { ok: false, message: "לא נמצאה רשימת שינויים לדירה זו." };
  }

  const pending = changeSet.items.filter((item) => item.status === "DETECTED");
  if (pending.length > 0) {
    return {
      ok: false,
      message: `נותרו ${pending.length} שינויים שממתינים לבדיקה. יש להכריע בהם לפני המעבר לתמחור.`,
    };
  }

  const awaitingConsultant = changeSet.items.filter(
    (item) => item.status === "AWAITING_CONSULTANT",
  );
  if (awaitingConsultant.length > 0) {
    return {
      ok: false,
      message: `${awaitingConsultant.length} שינויים ממתינים לתשובת יועץ. לא ניתן להעביר לתמחור לפני קבלת התשובה.`,
    };
  }

  const blocked = changeSet.items.filter(
    (item) => item.blockedFromAutomation && item.status !== "CONSULTANT_APPROVED",
  );
  if (blocked.length > 0) {
    return {
      ok: false,
      message: `${blocked.length} שינויים מסומנים כחוסמים. נדרש אישור גורם מקצועי לפני המשך התהליך.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.updateMany({
      where: { apartmentId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await tx.changeSet.update({ where: { id: changeSet.id }, data: { status: "REVIEWED" } });

    await tx.apartment.update({
      where: { id: apartmentId },
      data: { status: "AWAITING_PRICING" },
    });

    await tx.approval.updateMany({
      where: { apartmentId, kind: "MANAGER_REVIEW", status: "PENDING" },
      data: { status: "GRANTED", grantedById: user.id, grantedAt: new Date() },
    });

    await tx.professionalDecision.create({
      data: {
        apartmentId,
        userId: user.id,
        role: role as UserRole,
        kind: "PLAN_APPROVED",
        decision: "הבדיקה הושלמה והדירה הועברה לתמחור",
      },
    });
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId,
    userId: user.id,
    kind: "REVIEW_COMPLETED",
    message: `${user.name} סיימה את הבדיקה של דירה ${apartment.number} והעבירה אותה לתמחור`,
  });

  await notifyRole({
    organizationId: apartment.project.organizationId,
    roles: ["PRICING_MANAGER"],
    apartmentId,
    kind: "READY_FOR_PRICING",
    title: `דירה ${apartment.number} מוכנה לתמחור`,
    href: `/projects/${apartment.projectId}/apartments/${apartmentId}?tab=pricing`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartmentId}`);
  revalidatePath("/reviews");
  revalidatePath("/pricing");
  return { ok: true, message: "הבדיקה הושלמה. הדירה הועברה לתמחור." };
}

/** החזרת התוכנית לתיקון אצל המעצבת */
export async function returnPlanForCorrection(
  apartmentId: string,
  note: string,
): Promise<ActionResult> {
  const trimmed = note.trim();
  if (trimmed.length < 3) {
    return { ok: false, message: "יש לפרט מה נדרש לתקן." };
  }

  const apartment = await loadApartment(apartmentId);
  const { user, role } = await requireApartmentAccess(apartmentId, "review:perform");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול להחזיר תוכנית לתיקון." };
  }

  const changeSet = await prisma.changeSet.findFirst({
    where: { apartmentId },
    orderBy: { createdAt: "desc" },
  });

  await prisma.$transaction(async (tx) => {
    let review = await tx.review.findFirst({
      where: { apartmentId },
      orderBy: { createdAt: "desc" },
    });

    if (!review) {
      review = await tx.review.create({
        data: {
          apartmentId,
          changeSetId: changeSet?.id,
          reviewerId: user.id,
          status: "RETURNED_FOR_CORRECTION",
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
    } else {
      await tx.review.update({
        where: { id: review.id },
        data: { status: "RETURNED_FOR_CORRECTION", completedAt: new Date() },
      });
    }

    await tx.reviewComment.create({
      data: {
        reviewId: review.id,
        authorId: user.id,
        body: trimmed,
        isCorrectionRequest: true,
      },
    });

    if (changeSet) {
      await tx.planVersion.update({
        where: { id: changeSet.targetVersionId },
        data: { status: "NEEDS_CORRECTION" },
      });
    }

    await tx.apartment.update({
      where: { id: apartmentId },
      data: { status: "NEEDS_CORRECTION" },
    });

    await tx.professionalDecision.create({
      data: {
        apartmentId,
        planVersionId: changeSet?.targetVersionId,
        userId: user.id,
        role: role as UserRole,
        kind: "PLAN_RETURNED_FOR_CORRECTION",
        decision: "התוכנית הוחזרה לתיקון",
        notes: trimmed,
      },
    });
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId,
    userId: user.id,
    kind: "CORRECTION_REQUESTED",
    message: `${user.name} החזירה את תוכנית דירה ${apartment.number} לתיקון: ${trimmed}`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartmentId}`);
  revalidatePath("/reviews");
  return { ok: true, message: "התוכנית הוחזרה לתיקון." };
}

/** שחרור לביצוע — השלב האחרון, לאחר תשלום */
export async function releaseForExecution(apartmentId: string): Promise<ActionResult> {
  const apartment = await loadApartment(apartmentId);
  const { user, role } = await requireApartmentAccess(apartmentId, "execution:release");

  if (!hasProfessionalAuthority(role)) {
    return { ok: false, message: "רק בעל סמכות מקצועית יכול לשחרר תוכנית לביצוע." };
  }

  if (apartment.status !== "PAID") {
    return {
      ok: false,
      message: "ניתן לשחרר לביצוע רק לאחר שהתקבל תשלום מהדייר.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.apartment.update({
      where: { id: apartmentId },
      data: { status: "APPROVED_FOR_EXECUTION" },
    });

    await tx.approval.updateMany({
      where: { apartmentId, kind: "EXECUTION_RELEASE" },
      data: { status: "GRANTED", grantedById: user.id, grantedAt: new Date() },
    });

    await tx.professionalDecision.create({
      data: {
        apartmentId,
        userId: user.id,
        role: role as UserRole,
        kind: "RELEASED_FOR_EXECUTION",
        decision: "התוכנית שוחררה לביצוע",
      },
    });
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId,
    userId: user.id,
    kind: "EXECUTION_RELEASED",
    message: `תוכנית דירה ${apartment.number} אושרה לביצוע`,
  });

  revalidatePath(`/projects/${apartment.projectId}/apartments/${apartmentId}`);
  return { ok: true, message: "התוכנית אושרה לביצוע." };
}
