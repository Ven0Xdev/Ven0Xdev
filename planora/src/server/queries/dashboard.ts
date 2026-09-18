import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apartmentScopeFor, projectScopeFor } from "./workload";

/** דירות שממתינות לפעולה של המשתמש, לפי סדר דחיפות */
export async function getAttentionItems(user: SessionUser) {
  const apartmentScope = apartmentScopeFor(user);

  const [awaitingReview, answeredRequests, needsCorrection, awaitingPricing] = await Promise.all([
    prisma.apartment.findMany({
      where: { ...apartmentScope, status: "AWAITING_REVIEW" },
      include: { building: true, project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.consultantRequest.findMany({
      where: { apartment: apartmentScope, status: "ANSWERED" },
      include: {
        apartment: {
          include: { building: true, project: { select: { id: true, name: true } } },
        },
        responses: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.apartment.findMany({
      where: { ...apartmentScope, status: "NEEDS_CORRECTION" },
      include: { building: true, project: { select: { id: true, name: true } } },
      take: 6,
    }),
    prisma.apartment.findMany({
      where: { ...apartmentScope, status: "AWAITING_PRICING" },
      include: { building: true, project: { select: { id: true, name: true } } },
      take: 6,
    }),
  ]);

  return { awaitingReview, answeredRequests, needsCorrection, awaitingPricing };
}

export async function getRecentActivity(user: SessionUser, take = 10) {
  return prisma.activityLog.findMany({
    where: user.isSuperAdmin ? {} : { organizationId: { in: user.organizationIds } },
    include: {
      user: { select: { name: true, image: true } },
      apartment: { select: { id: true, number: true, projectId: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** התפלגות סטטוסים של דירות — לתצוגת פס בלוח הבקרה */
export async function getApartmentStatusBreakdown(user: SessionUser) {
  const rows = await prisma.apartment.groupBy({
    by: ["status"],
    where: apartmentScopeFor(user),
    _count: { _all: true },
  });

  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}

export async function getActiveProjects(user: SessionUser) {
  return prisma.project.findMany({
    where: projectScopeFor(user),
    include: {
      _count: { select: { apartments: true } },
      tenantChangeManager: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
