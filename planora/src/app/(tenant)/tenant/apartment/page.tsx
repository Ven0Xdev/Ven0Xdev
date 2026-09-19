import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Box, Map } from "lucide-react";

import { JourneyProgress } from "@/components/tenant/journey-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { formatApartment, formatDate, formatFloor } from "@/lib/i18n/format";
import {
  APARTMENT_STATUS_LABELS,
  APARTMENT_STATUS_TONE,
  TENANT_CATEGORY_LABELS,
} from "@/lib/i18n/he";
import { PAYMENT_STATUS_LABELS, computeJourney, evaluateChangeWindow } from "@/lib/tenant/journey";
import { getTenantJourneyData } from "@/server/queries/tenant";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "הדירה שלי" };

export default async function TenantApartmentPage() {
  const { apartment: access } = await requireTenantApartment();
  const { apartment, configuration, pricingSheet } = await getTenantJourneyData(access.id);

  const standardPackage = await prisma.apartmentStandardPackage.findMany({
    where: { apartmentId: access.id },
    include: { product: { include: { supplier: true } }, variant: true },
  });

  const changeWindow = evaluateChangeWindow({
    openDate: apartment.project.tenantChangesOpenDate,
    closeDate: apartment.project.tenantChangesCloseDate,
  });

  const journey = computeJourney({
    status: apartment.status,
    paymentStatus: apartment.paymentStatus,
    hasSubmittedSelections: Boolean(configuration && configuration.status !== "DRAFT"),
    hasPricingAwaitingApproval: pricingSheet?.status === "SENT_TO_TENANT",
    changesWindowClosed: !changeWindow.isOpen,
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">
          {formatApartment(apartment.number)}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {apartment.building.name} · {formatFloor(apartment.floor.number)}
          {apartment.apartmentType ? ` · ${apartment.apartmentType.name}` : ""}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>מה כלול בדירה שלך</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {standardPackage.length === 0 ? (
                <p className="py-4 text-[13px] text-ink-muted">
                  מפרט הדירה יוצג כאן לאחר שיוגדר בפרויקט.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {standardPackage.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {entry.product.name}
                          {entry.variant ? (
                            <span className="text-ink-muted"> · {entry.variant.name}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          {TENANT_CATEGORY_LABELS[entry.category]} · {entry.product.supplier.name}
                        </p>
                      </div>
                      <Badge tone="success" size="sm">
                        כלול בסטנדרט
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <ViewLink
              href="/tenant/view"
              icon={<Box className="size-5" aria-hidden />}
              title="תצוגת תלת-ממד"
              description="הדירה עם החומרים שבחרת"
            />
            <ViewLink
              href="/tenant/plans"
              icon={<Map className="size-5" aria-hidden />}
              title="תוכנית הדירה"
              description="התוכנית המאושרת בתצוגה דו-ממדית"
            />
          </div>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>מצב הדירה</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge tone={APARTMENT_STATUS_TONE[apartment.status]} dot>
                {APARTMENT_STATUS_LABELS[apartment.status]}
              </Badge>

              <div className="mt-4">
                <JourneyProgress journey={journey} />
              </div>

              <dl className="mt-5 space-y-3 border-t border-line pt-4">
                <Row label="פרויקט" value={apartment.project.name} />
                <Row label="יזם" value={apartment.project.developerName ?? "—"} />
                <Row label="טיפוס" value={apartment.apartmentType?.name ?? "—"} />
                <Row
                  label="מצב תשלום"
                  value={PAYMENT_STATUS_LABELS[apartment.paymentStatus]}
                />
                <Row
                  label="מועד סגירת שינויים"
                  value={
                    changeWindow.closeDate ? formatDate(changeWindow.closeDate) : "—"
                  }
                  numeric
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ViewLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-line-strong">
        <CardContent className="flex items-center gap-3 pt-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-600">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">{title}</span>
            <span className="mt-0.5 block text-[12px] text-ink-muted">{description}</span>
          </span>
          <ArrowLeft
            className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:-translate-x-0.5"
            aria-hidden
          />
        </CardContent>
      </Card>
    </Link>
  );
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-ink-muted">{label}</dt>
      <dd
        className={`min-w-0 truncate text-[13px] font-medium text-ink ${numeric ? "font-numeric" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
