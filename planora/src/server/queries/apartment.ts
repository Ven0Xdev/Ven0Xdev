import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";

/** כל הנתונים של Workspace הדירה בשאילתה אחת */
export async function getApartmentWorkspace(apartmentId: string) {
  const apartment = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          developerName: true,
          contractorName: true,
          changeDeadline: true,
        },
      },
      building: true,
      floor: true,
      apartmentType: true,
      assignedManager: { select: { id: true, name: true, image: true } },
      assignedCoordinator: { select: { id: true, name: true, image: true } },
      plans: {
        include: {
          versions: {
            include: {
              author: { select: { id: true, name: true } },
              drawingFiles: true,
            },
            orderBy: { versionNo: "asc" },
          },
        },
      },
      approvals: { orderBy: { createdAt: "asc" } },
      reviews: {
        include: {
          reviewer: { select: { id: true, name: true, image: true } },
          comments: {
            include: { author: { select: { id: true, name: true, image: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      consultantRequests: {
        include: {
          requestedBy: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          changeItem: { select: { id: true, code: true, description: true } },
          responses: {
            include: { responder: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      pricingSheets: {
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
          owner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      activities: {
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 60,
      },
      tenantUser: { select: { id: true, name: true, email: true } },
      configurations: {
        orderBy: { versionNo: "desc" },
        take: 1,
        include: {
          selections: {
            include: { product: { include: { supplier: true } }, variant: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      changeRequests: { orderBy: { createdAt: "desc" } },
      exceptionRequests: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!apartment) notFound();

  const changeSet = await prisma.changeSet.findFirst({
    where: { apartmentId },
    orderBy: { createdAt: "desc" },
    include: {
      baseVersion: { select: { id: true, versionNo: true, title: true } },
      targetVersion: { select: { id: true, versionNo: true, title: true } },
      items: {
        include: {
          ruleHits: true,
          decidedBy: { select: { id: true, name: true } },
          consultantRequests: {
            include: { responses: { orderBy: { createdAt: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
          },
          reviewComments: {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { code: "asc" },
      },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const professionalDecisions = await prisma.professionalDecision.findMany({
    where: { apartmentId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const consultants = await prisma.organizationMember.findMany({
    where: {
      organizationId: apartment.project.organizationId,
      isActive: true,
      role: {
        in: [
          "PLUMBING_CONSULTANT",
          "HVAC_CONSULTANT",
          "ELECTRICAL_CONSULTANT",
          "STRUCTURAL_CONSULTANT",
          "ARCHITECT",
        ],
      },
    },
    include: { user: { select: { id: true, name: true } } },
  });

  return { apartment, changeSet, professionalDecisions, consultants };
}

export type ApartmentWorkspace = Awaited<ReturnType<typeof getApartmentWorkspace>>;
