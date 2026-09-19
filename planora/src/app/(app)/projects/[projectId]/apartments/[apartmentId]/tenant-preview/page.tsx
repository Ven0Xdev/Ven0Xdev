import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import {
  JourneyProgress,
  JourneyTimeline,
  NextActionCard,
} from "@/components/tenant/journey-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApartmentAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatApartment, formatCurrency, formatFloor } from "@/lib/i18n/format";
import {
  APARTMENT_STATUS_LABELS,
  APARTMENT_STATUS_TONE,
  TENANT_CATEGORY_LABELS,
} from "@/lib/i18n/he";
import { computeConfigurationPricing } from "@/lib/pricing/configuration";
import { computeJourney, evaluateChangeWindow } from "@/lib/tenant/journey";
import { getTenantJourneyData } from "@/server/queries/tenant";

export const metadata: Metadata = { title: "תצוגת דייר" };

/**
 * תצוגת דייר עבור הגורם המקצועי.
 *
 * המסך מציג בדיוק את מה שהדייר רואה — ללא רמת ודאות, כללים או מידע מסחרי —
 * כדי שמנהלת שינויי הדיירים תדע מה מוצג לו בפועל. התצוגה לקריאה בלבד.
 */
export default async function TenantPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; apartmentId: string }>;
}) {
  const { apartmentId } = await params;
  await requireApartmentAccess(apartmentId, "project:view");

  const apartmentRecord = await prisma.apartment.findUnique({
    where: { id: apartmentId },
    select: { tenantUserId: true, tenantUser: { select: { name: true, email: true } } },
  });

  if (!apartmentRecord?.tenantUserId) notFound();

  const { apartment, configuration, pricingSheet } = await getTenantJourneyData(apartmentId);

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

  return (
    <>
      <nav aria-label="מיקום" className="mb-3 flex items-center gap-1 text-[12px] text-ink-muted">
        <Link href={`/projects/${apartment.projectId}`} className="hover:text-ink">
          {apartment.project.name}
        </Link>
        <ChevronLeft className="size-3.5" aria-hidden />
        <Link
          href={`/projects/${apartment.projectId}/apartments/${apartmentId}`}
          className="hover:text-ink"
        >
          {formatApartment(apartment.number)}
        </Link>
        <ChevronLeft className="size-3.5" aria-hidden />
        <span className="text-ink-soft">תצוגת דייר</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-200 bg-brand-50/60 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] text-brand-800">
          <Eye className="size-4 shrink-0" aria-hidden />
          זו התצוגה של {apartmentRecord.tenantUser?.name}. המסך לקריאה בלבד ואינו כולל
          מידע מקצועי או מסחרי.
        </p>
        <Link
          href={`/projects/${apartment.projectId}/apartments/${apartmentId}`}
          className="text-[12px] font-medium text-brand-700 hover:text-brand-800"
        >
          חזרה לממשק המקצועי
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">
          {formatApartment(apartment.number)} · {apartment.building.name} ·{" "}
          {formatFloor(apartment.floor.number)}
        </h1>
        <div className="mt-2">
          <Badge tone={APARTMENT_STATUS_TONE[apartment.status]} dot>
            {APARTMENT_STATUS_LABELS[apartment.status]}
          </Badge>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <NextActionCard journey={journey} />

          <Card>
            <CardHeader>
              <CardTitle>הבחירות של הדייר</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!configuration || configuration.selections.length === 0 ? (
                <p className="py-4 text-[13px] text-ink-muted">הדייר טרם בחר שדרוגים.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {configuration.selections.map((selection) => (
                    <li key={selection.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {selection.product.name}
                          {selection.variant ? (
                            <span className="text-ink-muted"> · {selection.variant.name}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          {TENANT_CATEGORY_LABELS[selection.category]}
                        </p>
                      </div>
                      <p className="font-numeric shrink-0 text-[13px] font-medium text-ink">
                        {selection.price > 0
                          ? formatCurrency(selection.price, { decimals: false })
                          : "כלול"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-[13px] font-medium text-ink">
                  סה&rdquo;כ שמוצג לדייר
                </span>
                <span className="font-numeric text-[17px] font-semibold text-ink">
                  {formatCurrency(pricing.totals.total)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>מצב התהליך כפי שהדייר רואה</CardTitle>
          </CardHeader>
          <CardContent>
            <JourneyProgress journey={journey} />
            <div className="mt-5 border-t border-line pt-5">
              <JourneyTimeline journey={journey} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
