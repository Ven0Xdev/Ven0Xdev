import type { Metadata } from "next";
import { Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, formatNumber } from "@/lib/i18n/format";
import {
  SELECTION_STATUS_LABELS,
  SELECTION_STATUS_TONE,
  TENANT_CATEGORY_LABELS,
} from "@/lib/i18n/he";
import { computeConfigurationPricing } from "@/lib/pricing/configuration";

export const metadata: Metadata = { title: "המחיר שלי" };

export default async function TenantPricingPage() {
  const { apartment: access } = await requireTenantApartment();

  const [configuration, pricingSheet] = await Promise.all([
    prisma.apartmentConfiguration.findFirst({
      where: { apartmentId: access.id },
      orderBy: { versionNo: "desc" },
      include: {
        selections: {
          include: { product: true, variant: true },
          orderBy: { category: "asc" },
        },
      },
    }),
    prisma.pricingSheet.findFirst({
      where: {
        apartmentId: access.id,
        status: { in: ["SENT_TO_TENANT", "APPROVED_BY_TENANT", "PAID"] },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const selections = configuration?.selections ?? [];

  const pricing = computeConfigurationPricing({
    selections: selections.map((selection) => ({
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
    vatRate: pricingSheet?.vatRate ?? 18,
    includeDrafts: true,
  });

  const hasAnything = selections.length > 0 || (pricingSheet?.lines.length ?? 0) > 0;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl leading-7 font-semibold text-ink">המחיר שלי</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-ink-muted">
          פירוט השדרוגים והשינויים בדירה. המחיר הסופי נקבע לאחר בדיקה מקצועית ואישור.
        </p>
      </header>

      {!hasAnything ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title="עדיין אין מה לתמחר."
          description="לאחר בחירת שדרוגים או שליחת בקשת שינוי, הפירוט יופיע כאן."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {selections.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>השדרוגים שבחרתי</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <TableWrapper className="border-0 shadow-none">
                    <Table>
                      <THead>
                        <TR>
                          <TH>פריט</TH>
                          <TH>קטגוריה</TH>
                          <TH>סטטוס</TH>
                          <TH className="text-left">מחיר</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {selections.map((selection) => (
                          <TR key={selection.id}>
                            <TD className="font-medium text-ink">
                              {selection.product.name}
                              {selection.variant ? (
                                <span className="mt-0.5 block text-[11px] text-ink-muted">
                                  {selection.variant.name}
                                </span>
                              ) : null}
                            </TD>
                            <TD className="text-ink-muted">
                              {TENANT_CATEGORY_LABELS[selection.category]}
                            </TD>
                            <TD>
                              <Badge tone={SELECTION_STATUS_TONE[selection.status]} size="sm">
                                {SELECTION_STATUS_LABELS[selection.status]}
                              </Badge>
                            </TD>
                            <TD className="font-numeric text-left font-medium text-ink">
                              {selection.price > 0
                                ? formatCurrency(selection.price * selection.quantity)
                                : "כלול"}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrapper>
                </CardContent>
              </Card>
            ) : null}

            {pricingSheet && pricingSheet.lines.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>שינויים בתוכנית</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <TableWrapper className="border-0 shadow-none">
                    <Table>
                      <THead>
                        <TR>
                          <TH>תיאור</TH>
                          <TH className="text-left">כמות</TH>
                          <TH className="text-left">סה&rdquo;כ</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {pricingSheet.lines.map((line) => (
                          <TR key={line.id}>
                            <TD className="font-medium text-ink">{line.description}</TD>
                            <TD className="font-numeric text-left">
                              {formatNumber(line.quantity, Number.isInteger(line.quantity) ? 0 : 1)}
                            </TD>
                            <TD className="font-numeric text-left font-medium text-ink">
                              {formatCurrency(line.quantity * line.unitPrice)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrapper>

                  {pricingSheet.sentAt ? (
                    <p className="font-numeric mt-3 text-[11px] text-ink-subtle">
                      נשלח אליך בתאריך {formatDate(pricingSheet.sentAt)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>סיכום</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5">
                <Row label="סכום לפני מע&rdquo;מ" value={formatCurrency(pricing.totals.subtotal)} />
                {pricing.totals.discount > 0 ? (
                  <Row label="הנחה" value={`-${formatCurrency(pricing.totals.discount)}`} />
                ) : null}
                <Row label="מע&rdquo;מ" value={formatCurrency(pricing.totals.vat)} />
              </dl>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <span className="text-[13px] font-medium text-ink">סה&rdquo;כ</span>
                <span className="font-numeric text-[22px] leading-7 font-semibold text-ink">
                  {formatCurrency(pricing.totals.total)}
                </span>
              </div>

              <p className="mt-4 text-[11px] leading-5 text-ink-subtle">
                הסכום כולל מע&rdquo;מ. בחירות בטיוטה נכללות בהערכה בלבד ואינן מחייבות.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="font-numeric text-[13px] text-ink-soft">{value}</dd>
    </div>
  );
}
