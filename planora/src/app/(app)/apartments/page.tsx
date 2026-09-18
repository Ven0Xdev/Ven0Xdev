import type { Metadata } from "next";
import type { ApartmentStatus, Prisma } from "@prisma/client";

import { ApartmentTable } from "@/components/domain/apartment-table";
import { FilterBar } from "@/components/domain/filter-bar";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APARTMENT_STATUS_LABELS, NAV_LABELS } from "@/lib/i18n/he";
import { apartmentScopeFor, projectScopeFor } from "@/server/queries/workload";

export const metadata: Metadata = { title: NAV_LABELS.apartments };

const STATUS_VALUES = Object.keys(APARTMENT_STATUS_LABELS) as ApartmentStatus[];

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; project?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { status, project, q } = await searchParams;

  const where: Prisma.ApartmentWhereInput = { ...apartmentScopeFor(user) };

  if (status && STATUS_VALUES.includes(status as ApartmentStatus)) {
    where.status = status as ApartmentStatus;
  }
  if (project) {
    where.projectId = project;
  }
  if (q) {
    where.OR = [
      { number: { startsWith: q } },
      { buyerName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [apartments, projects] = await Promise.all([
    prisma.apartment.findMany({
      where,
      include: {
        building: true,
        floor: true,
        apartmentType: true,
        project: { select: { id: true, name: true } },
        assignedManager: { select: { name: true } },
        changeSets: { select: { detectedCount: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ project: { name: "asc" } }, { building: { name: "asc" } }, { number: "asc" }],
      take: 200,
    }),
    prisma.project.findMany({
      where: projectScopeFor(user),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={NAV_LABELS.apartments}
        description={`${apartments.length} דירות תואמות לסינון הנוכחי.`}
      />

      <FilterBar
        searchPlaceholder="מספר דירה או שם רוכש"
        filters={[
          {
            name: "status",
            label: "סטטוס",
            options: STATUS_VALUES.map((value) => ({
              value,
              label: APARTMENT_STATUS_LABELS[value],
            })),
          },
          {
            name: "project",
            label: "פרויקט",
            options: projects.map((item) => ({ value: item.id, label: item.name })),
          },
        ]}
      />

      <ApartmentTable
        showProject
        rows={apartments.map((apartment) => ({
          id: apartment.id,
          number: apartment.number,
          buildingName: apartment.building.name,
          floorNumber: apartment.floor.number,
          typeName: apartment.apartmentType?.name ?? null,
          buyerName: apartment.buyerName,
          status: apartment.status,
          dueDate: apartment.dueDate,
          projectId: apartment.projectId,
          projectName: apartment.project.name,
          changeCount: apartment.changeSets[0]?.detectedCount,
          managerName: apartment.assignedManager?.name ?? null,
        }))}
        emptyTitle="לא נמצאו דירות שתואמות לסינון."
        emptyDescription="נסה לשנות את הסינון או לנקות אותו."
      />
    </>
  );
}
