import type { Metadata } from "next";
import type { ApartmentStatus } from "@prisma/client";

import { ApartmentTable } from "@/components/domain/apartment-table";
import { StatCard } from "@/components/domain/stat-card";
import { UrlTabs, type UrlTab } from "@/components/ui/url-tabs";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NAV_LABELS } from "@/lib/i18n/he";
import { apartmentScopeFor } from "@/server/queries/workload";

export const metadata: Metadata = { title: NAV_LABELS.reviews };

async function loadApartments(user: Awaited<ReturnType<typeof requireUser>>, status: ApartmentStatus) {
  const apartments = await prisma.apartment.findMany({
    where: { ...apartmentScopeFor(user), status },
    include: {
      building: true,
      floor: true,
      apartmentType: true,
      project: { select: { id: true, name: true } },
      changeSets: { select: { detectedCount: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { dueDate: "asc" },
  });

  return apartments.map((apartment) => ({
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
  }));
}

export default async function ReviewsPage() {
  const user = await requireUser();

  const [awaitingReview, needsCorrection, inProgress] = await Promise.all([
    loadApartments(user, "AWAITING_REVIEW"),
    loadApartments(user, "NEEDS_CORRECTION"),
    loadApartments(user, "CHANGES_IN_PROGRESS"),
  ]);

  const tabs: UrlTab[] = [
    {
      key: "AWAITING_REVIEW",
      label: "ממתין לבדיקה",
      badge: awaitingReview.length,
      content: (
        <ApartmentTable
          showProject
          rows={awaitingReview}
          emptyTitle="אין כרגע דירות שממתינות לבדיקה."
          emptyDescription="כשיועלו תוכניות חדשות הן יופיעו כאן."
        />
      ),
    },
    {
      key: "NEEDS_CORRECTION",
      label: "נדרש תיקון",
      badge: needsCorrection.length,
      content: (
        <ApartmentTable
          showProject
          rows={needsCorrection}
          emptyTitle="אין תוכניות שממתינות לתיקון."
          emptyDescription="תוכנית שתוחזר לתיקון תופיע כאן עד לקבלת גרסה מתוקנת."
        />
      ),
    },
    {
      key: "CHANGES_IN_PROGRESS",
      label: "בתהליך שינויים",
      badge: inProgress.length,
      content: (
        <ApartmentTable
          showProject
          rows={inProgress}
          emptyTitle="אין דירות בתהליך שינויים."
          emptyDescription="דירות שהחלו תהליך שינויים מול המעצבת יופיעו כאן."
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={NAV_LABELS.reviews}
        description="כל התוכניות שממתינות לבדיקה מקצועית, לפי מצב התהליך."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="ממתין לבדיקה" value={awaitingReview.length} tone="warning" />
        <StatCard label="נדרש תיקון" value={needsCorrection.length} tone="danger" />
        <StatCard label="בתהליך שינויים" value={inProgress.length} tone="brand" />
      </div>

      <UrlTabs tabs={tabs} paramName="status" />
    </>
  );
}
