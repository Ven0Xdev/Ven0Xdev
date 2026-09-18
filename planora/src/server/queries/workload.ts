import type { Prisma } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** מסנן הבסיס לפרויקטים שהמשתמש רשאי לראות */
export function projectScopeFor(user: SessionUser): Prisma.ProjectWhereInput {
  if (user.isSuperAdmin) return {};
  return { organizationId: { in: user.organizationIds } };
}

export function apartmentScopeFor(user: SessionUser): Prisma.ApartmentWhereInput {
  return { project: projectScopeFor(user) };
}

export interface WorkloadCounts {
  activeProjects: number;
  awaitingReview: number;
  awaitingConsultant: number;
  awaitingPricing: number;
  needsCorrection: number;
  readyForExecution: number;
  openAssignments: number;
  consultantRequestsPending: number;
  consultantResponsesReceived: number;
}

/** המדדים שמופיעים בלוח הבקרה ובסרגל הצד */
export async function getWorkloadCounts(user: SessionUser): Promise<WorkloadCounts> {
  const apartmentScope = apartmentScopeFor(user);

  const [
    activeProjects,
    awaitingReview,
    awaitingConsultant,
    awaitingPricing,
    needsCorrection,
    readyForExecution,
    openAssignments,
    consultantRequestsPending,
    consultantResponsesReceived,
  ] = await Promise.all([
    prisma.project.count({
      where: {
        ...projectScopeFor(user),
        status: { in: ["ACTIVE", "TENANT_CHANGES", "EXECUTION"] },
      },
    }),
    prisma.apartment.count({ where: { ...apartmentScope, status: "AWAITING_REVIEW" } }),
    prisma.apartment.count({ where: { ...apartmentScope, status: "AWAITING_CONSULTANT" } }),
    prisma.apartment.count({ where: { ...apartmentScope, status: "AWAITING_PRICING" } }),
    prisma.apartment.count({ where: { ...apartmentScope, status: "NEEDS_CORRECTION" } }),
    prisma.apartment.count({ where: { ...apartmentScope, status: "APPROVED_FOR_EXECUTION" } }),
    prisma.professionalAssignment.count({
      where: { assigneeId: user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.consultantRequest.count({
      where: { apartment: apartmentScope, status: "PENDING" },
    }),
    prisma.consultantRequest.count({
      where: {
        apartment: apartmentScope,
        status: "ANSWERED",
        requestedById: user.id,
      },
    }),
  ]);

  return {
    activeProjects,
    awaitingReview,
    awaitingConsultant,
    awaitingPricing,
    needsCorrection,
    readyForExecution,
    openAssignments,
    consultantRequestsPending,
    consultantResponsesReceived,
  };
}

export async function getUnreadNotifications(userId: string, take = 12) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
