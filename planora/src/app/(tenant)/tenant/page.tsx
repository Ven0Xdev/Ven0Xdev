import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Box, CalendarClock, Phone } from "lucide-react";

import {
  JourneyProgress,
  JourneyTimeline,
  NextActionCard,
} from "@/components/tenant/journey-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { formatApartment, formatCurrency, formatDate, formatFloor } from "@/lib/i18n/format";
import { APARTMENT_STATUS_LABELS, APARTMENT_STATUS_TONE } from "@/lib/i18n/he";
import { computeConfigurationPricing } from "@/lib/pricing/configuration";
import { computeJourney, evaluateChangeWindow } from "@/lib/tenant/journey";
import { getTenantJourneyData } from "@/server/queries/tenant";

export const metadata: Metadata = { title: "סקירה" };

export default async function TenantOverviewPage() {
  const { apartment: access, user } = await requireTenantApartment();
  const data = await getTenantJourneyData(access.id);
  const { apartment, configuration, changeRequests, pricingSheet, changeSet } = data;

  const changeWindow = evaluateChangeWindow({
    openDate: apartment.project.tenantChangesOpenDate,
    closeDate: apartment.project.tenantChangesCloseDate,
  });

  const journey = computeJourney({
    status: apartment.status,
    paymentStatus: apartment.paymentStatus,
    hasSubmittedSelections: Boolean(configuration && configuration.status !== "DRAFT"),
    hasPricingAwaitingApproval: pricingSheet?.status === "SENT_TO_TENANT",
    openChangeRequests: changeRequests.filter((request) =>
      ["SUBMITTED", "UNDER_REVIEW", "REQUIRES_CONSULTANT"].includes(request.status),
    ).length,
    changesWindowClosed: !changeWindow.isOpen,
  });

  const pricing = computeConfigurationPricing({
    selections: (configuration?.selections ?? []).map((selection) => ({
      id: selection.id,
      category: selection.category,
      productName: selection.product.name,
      variantName: selection.variant?.name ?? null,
      quantity: selection.quantity,
      price: selection.price,
      status: selection.status,
    })),
    professionalChanges: (pricingSheet?.lines ?? []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
    includeDrafts: true,
  });

  const changesInReview = (changeSet?.items ?? []).filter(
    (item) => item.status === "DETECTED" || item.status === "AWAITING_CONSULTANT",
  ).length;

  const firstName = user.name.split(" ")[0];

  return (
    <>
      <header className="mb-7">
        <h1 className="text-2xl leading-8 font-semibold text-ink">
          שלום {firstName}, זו הדירה שלך
        </h1>
        <p className="mt-2 text-[14px] text-ink-muted">
          {formatApartment(apartment.number)} · {apartment.building.name} ·{" "}
          {formatFloor(apartment.floor.number)} · {apartment.project.name}
        </p>
        <div className="mt-3">
          <Badge tone={APARTMENT_STATUS_TONE[apartment.status]} dot>
            {APARTMENT_STATUS_LABELS[apartment.status]}
          </Badge>
        </div>
      </header>

      {apartment.project.portalWelcomeText ? (
        <p className="mb-6 rounded-card border border-line bg-surface px-5 py-4 text-[13px] leading-6 text-ink-soft shadow-subtle">
          {apartment.project.portalWelcomeText}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <NextActionCard journey={journey} />

          <Card>
            <CardHeader>
              <CardTitle>מצב התהליך</CardTitle>
            </CardHeader>
            <CardContent>
              <JourneyProgress journey={journey} />

              <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
                <Metric
                  label="שינויים בבדיקה"
                  value={String(changesInReview)}
                  hint={changesInReview > 0 ? "נעדכן אותך בסיום" : "אין שינויים פתוחים"}
                />
                <Metric
                  label="הבחירות שלי"
                  value={String(configuration?.selections.length ?? 0)}
                  hint="שדרוגים שבחרת"
                />
                <Metric
                  label="סך השדרוגים"
                  value={formatCurrency(pricing.totals.total, { decimals: false })}
                  hint="כולל מע&rdquo;מ, לפני אישור"
                />
              </div>
            </CardContent>
          </Card>

          {/* כניסה לתלת-ממד */}
          <Link href="/tenant/view" className="group block">
            <Card className="overflow-hidden transition-colors group-hover:border-line-strong">
              <div className="bg-blueprint relative flex h-36 items-center justify-center bg-brand-50/50">
                <Box className="size-10 text-brand-400" aria-hidden />
              </div>
              <CardContent className="flex items-center justify-between gap-3 pt-4">
                <div>
                  <p className="text-[14px] font-semibold text-ink">צפה בדירה בתלת-ממד</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    לראות את הדירה עם החומרים שבחרת, בשעות שונות של היום.
                  </p>
                </div>
                <ArrowLeft
                  className="size-4 shrink-0 text-brand-600 transition-transform group-hover:-translate-x-0.5"
                  aria-hidden
                />
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>השלבים בתהליך</CardTitle>
            </CardHeader>
            <CardContent>
              <JourneyTimeline journey={journey} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="flex items-start gap-2 text-[13px] leading-6 text-ink-soft">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                {changeWindow.isOpen && changeWindow.closeDate ? (
                  <span>
                    ניתן לבצע שינויים עד{" "}
                    <span className="font-numeric font-medium text-ink">
                      {formatDate(changeWindow.closeDate)}
                    </span>
                  </span>
                ) : (
                  <span>{changeWindow.message}</span>
                )}
              </p>

              {apartment.assignedManager ? (
                <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-muted">
                  מנהלת שינויי הדיירים שלך: {apartment.assignedManager.name}
                </p>
              ) : null}

              {apartment.project.supportPhone || apartment.project.supportHours ? (
                <p className="mt-2 flex items-start gap-2 text-[12px] leading-5 text-ink-muted">
                  <Phone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    {apartment.project.supportPhone ? (
                      <span className="font-numeric">{apartment.project.supportPhone}</span>
                    ) : null}
                    {apartment.project.supportHours ? ` · ${apartment.project.supportHours}` : ""}
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className="font-numeric mt-1 text-xl leading-7 font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}
