import type { Metadata } from "next";
import { FileCheck2, FileText, Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { formatCurrency, formatDate } from "@/lib/i18n/format";
import {
  APPROVAL_KIND_LABELS,
  PLAN_KIND_LABELS,
  PRICING_SHEET_STATUS_LABELS,
  PRICING_SHEET_STATUS_TONE,
} from "@/lib/i18n/he";
import { computeTotals } from "@/lib/pricing/engine";
import { getTenantDocuments } from "@/server/queries/tenant";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "מסמכים" };

export default async function TenantDocumentsPage() {
  const { apartment: access } = await requireTenantApartment();
  const { versions, pricingSheets, approvals } = await getTenantDocuments(access.id);

  const sheetsWithTotals = await Promise.all(
    pricingSheets.map(async (sheet) => {
      const lines = await prisma.pricingLine.findMany({
        where: { pricingSheetId: sheet.id },
        select: { quantity: true, unitPrice: true },
      });
      return {
        ...sheet,
        total: computeTotals(lines, { discount: sheet.discount, vatRate: sheet.vatRate }).total,
      };
    }),
  );

  const isEmpty =
    versions.length === 0 && sheetsWithTotals.length === 0 && approvals.length === 0;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">מסמכים</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          התוכניות, הצעות המחיר והאישורים ששייכים לדירה שלך.
        </p>
      </header>

      {isEmpty ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="עדיין אין מסמכים זמינים."
          description="תוכניות, הצעות מחיר ואישורים יופיעו כאן ככל שהתהליך מתקדם."
        />
      ) : (
        <div className="space-y-7">
          {versions.length > 0 ? (
            <DocumentSection
              title="תוכניות"
              icon={<FileText className="size-4" aria-hidden />}
              items={versions.map((version) => ({
                id: version.id,
                title: version.title,
                subtitle: `${PLAN_KIND_LABELS[version.plan.kind]} · גרסה ${version.versionNo}`,
                date: version.createdAt,
                badge: version.isCurrent ? "התוכנית הנוכחית" : null,
                extra:
                  version.drawingFiles.length > 0
                    ? `${version.drawingFiles.length} קבצים מצורפים`
                    : null,
              }))}
            />
          ) : null}

          {sheetsWithTotals.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Receipt className="size-4 text-ink-subtle" aria-hidden />
                הצעות מחיר
              </h2>
              <div className="space-y-3">
                {sheetsWithTotals.map((sheet) => (
                  <Card key={sheet.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                      <div>
                        <p className="text-[13px] font-medium text-ink">
                          הצעת מחיר לשינויים
                        </p>
                        <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">
                          {sheet.lines.length} שורות ·{" "}
                          {sheet.sentAt ? formatDate(sheet.sentAt) : formatDate(sheet.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-numeric text-[15px] font-semibold text-ink">
                          {formatCurrency(sheet.total)}
                        </span>
                        <Badge tone={PRICING_SHEET_STATUS_TONE[sheet.status]}>
                          {PRICING_SHEET_STATUS_LABELS[sheet.status]}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {approvals.length > 0 ? (
            <DocumentSection
              title="אישורים"
              icon={<FileCheck2 className="size-4" aria-hidden />}
              items={approvals.map((approval) => ({
                id: approval.id,
                title: APPROVAL_KIND_LABELS[approval.kind],
                subtitle: "אושר",
                date: approval.grantedAt ?? approval.createdAt,
                badge: null,
                extra: approval.notes,
              }))}
            />
          ) : null}
        </div>
      )}

      <p className="mt-8 text-[12px] leading-5 text-ink-subtle">
        חתימה דיגיטלית על מסמכים וקבלות תתאפשר בהמשך. כרגע המסמכים זמינים לצפייה בלבד.
      </p>
    </>
  );
}

function DocumentSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: {
    id: string;
    title: string;
    subtitle: string;
    date: Date;
    badge: string | null;
    extra: string | null;
  }[];
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink">
        <span className="text-ink-subtle">{icon}</span>
        {title}
      </h2>
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{item.title}</p>
                <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">
                  {item.subtitle} · {formatDate(item.date)}
                </p>
                {item.extra ? (
                  <p className="mt-1 text-[12px] text-ink-muted">{item.extra}</p>
                ) : null}
              </div>
              {item.badge ? <Badge tone="brand">{item.badge}</Badge> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
