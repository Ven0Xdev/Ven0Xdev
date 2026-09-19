import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, CheckCircle2, Home, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { formatApartment, formatCurrency, formatDate, formatFloor } from "@/lib/i18n/format";
import {
  APARTMENT_STATUS_LABELS,
  APARTMENT_STATUS_TONE,
  CHANGE_REQUEST_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_TONE,
  CONFIGURATION_STATUS_LABELS,
  CONFIGURATION_STATUS_TONE,
  EXCEPTION_REQUEST_STATUS_LABELS,
  EXCEPTION_REQUEST_STATUS_TONE,
  TENANT_CATEGORY_LABELS,
} from "@/lib/i18n/he";
import { computeConfigurationPricing } from "@/lib/pricing/configuration";
import { getTenantOverview } from "@/server/queries/tenant";

export const metadata: Metadata = { title: "הדירה שלי" };

export default async function TenantHomePage() {
  const { apartment: access, user } = await requireTenantApartment();
  const { apartment, configuration, changeRequests, exceptionRequests } =
    await getTenantOverview(access.id);

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
    includeDrafts: true,
  });

  const openRequests = [
    ...changeRequests.filter((request) =>
      ["SUBMITTED", "UNDER_REVIEW", "REQUIRES_CONSULTANT", "PRICED"].includes(request.status),
    ),
    ...exceptionRequests.filter((request) =>
      ["SUBMITTED", "UNDER_REVIEW", "SENT_TO_SUPPLIER", "MORE_INFO_REQUIRED"].includes(
        request.status,
      ),
    ),
  ];

  const firstName = user.name.split(" ")[0];

  return (
    <>
      <header className="mb-7">
        <p className="text-[13px] text-ink-muted">שלום {firstName},</p>
        <h1 className="mt-1 text-2xl leading-8 font-semibold text-ink">
          {formatApartment(apartment.number)}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {apartment.building.name} · {formatFloor(apartment.floor.number)}
          {apartment.apartmentType ? ` · ${apartment.apartmentType.name}` : ""} ·{" "}
          {apartment.project.name}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-[12px] text-ink-muted">סטטוס הדירה</p>
            <div className="mt-2">
              <Badge tone={APARTMENT_STATUS_TONE[apartment.status]} dot>
                {APARTMENT_STATUS_LABELS[apartment.status]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-[12px] text-ink-muted">הבחירות שלי</p>
            <p className="font-numeric mt-1.5 text-2xl leading-8 font-semibold text-ink">
              {configuration?.selections.length ?? 0}
            </p>
            {configuration ? (
              <div className="mt-1.5">
                <Badge tone={CONFIGURATION_STATUS_TONE[configuration.status]} size="sm">
                  {CONFIGURATION_STATUS_LABELS[configuration.status]}
                </Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-[12px] text-ink-muted">סך השדרוגים</p>
            <p className="font-numeric mt-1.5 text-2xl leading-8 font-semibold text-ink">
              {formatCurrency(pricing.totals.total, { decimals: false })}
            </p>
            <p className="mt-1 text-[11px] text-ink-subtle">כולל מע&rdquo;מ, לפני אישור סופי</p>
          </CardContent>
        </Card>
      </div>

      {apartment.project.changeDeadline ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-card border border-warning-100 bg-warning-50 px-4 py-3">
          <CalendarClock className="size-4 shrink-0 text-warning-700" aria-hidden />
          <p className="text-[13px] text-warning-700">
            מועד הסגירה לבחירות בפרויקט:{" "}
            <span className="font-numeric font-medium">
              {formatDate(apartment.project.changeDeadline)}
            </span>
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>הבחירות שלי</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!configuration || configuration.selections.length === 0 ? (
              <EmptyState
                icon={<Home className="size-5" />}
                title="עדיין לא בחרת שדרוגים."
                description="אפשר להתחיל לעצב את הדירה ולראות איך היא נראית."
                className="border-0 bg-transparent py-8"
                action={
                  <Link
                    href="/tenant/apartment"
                    className="inline-flex items-center gap-1.5 rounded-control bg-brand-600 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
                  >
                    מעבר לעיצוב הדירה
                    <ArrowLeft className="size-3.5" aria-hidden />
                  </Link>
                }
              />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>בקשות פתוחות</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {openRequests.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="size-5" />}
                title="אין בקשות פתוחות."
                description="בקשה שתשלח תופיע כאן עד לקבלת תשובה."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <ul className="space-y-3">
                {changeRequests.slice(0, 4).map((request) => (
                  <li key={request.id} className="rounded-card border border-line px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-ink">{request.title}</p>
                      <Badge tone={CHANGE_REQUEST_STATUS_TONE[request.status]} size="sm">
                        {CHANGE_REQUEST_STATUS_LABELS[request.status]}
                      </Badge>
                    </div>
                    <p className="font-numeric mt-1 text-[11px] text-ink-subtle">
                      {request.code} · {formatDate(request.createdAt)}
                    </p>
                  </li>
                ))}
                {exceptionRequests.slice(0, 3).map((request) => (
                  <li key={request.id} className="rounded-card border border-line px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-ink">{request.title}</p>
                      <Badge tone={EXCEPTION_REQUEST_STATUS_TONE[request.status]} size="sm">
                        {EXCEPTION_REQUEST_STATUS_LABELS[request.status]}
                      </Badge>
                    </div>
                    <p className="font-numeric mt-1 text-[11px] text-ink-subtle">
                      {request.code} · {formatDate(request.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href="/tenant/requests"
              className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-brand-600 hover:text-brand-700"
            >
              <MessageSquare className="size-3.5" aria-hidden />
              לכל הבקשות שלי
            </Link>
          </CardContent>
        </Card>
      </div>

      {apartment.assignedManager ? (
        <p className="mt-6 text-[12px] text-ink-muted">
          מנהלת שינויי הדיירים שלך: {apartment.assignedManager.name}
        </p>
      ) : null}
    </>
  );
}
