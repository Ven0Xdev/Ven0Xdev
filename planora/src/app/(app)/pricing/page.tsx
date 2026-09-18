import type { Metadata } from "next";
import Link from "next/link";

import { ApartmentTable } from "@/components/domain/apartment-table";
import { PricingStatusBadge } from "@/components/domain/status-badges";
import { StatCard } from "@/components/domain/stat-card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { UrlTabs, type UrlTab } from "@/components/ui/url-tabs";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeTotals } from "@/lib/pricing/engine";
import { formatCurrency, formatDate } from "@/lib/i18n/format";
import { NAV_LABELS } from "@/lib/i18n/he";
import { apartmentScopeFor } from "@/server/queries/workload";

export const metadata: Metadata = { title: NAV_LABELS.pricing };

export default async function PricingPage() {
  const user = await requireUser();
  const scope = apartmentScopeFor(user);

  const [awaitingPricing, sheets] = await Promise.all([
    prisma.apartment.findMany({
      where: { ...scope, status: "AWAITING_PRICING" },
      include: {
        building: true,
        floor: true,
        apartmentType: true,
        project: { select: { id: true, name: true } },
        changeSets: { select: { detectedCount: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.pricingSheet.findMany({
      where: { apartment: scope },
      include: {
        lines: true,
        apartment: {
          include: { building: true, project: { select: { id: true, name: true } } },
        },
        owner: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const totalValue = sheets.reduce((sum, sheet) => {
    const totals = computeTotals(sheet.lines, {
      discount: sheet.discount,
      vatRate: sheet.vatRate,
    });
    return sum + totals.total;
  }, 0);

  const sheetsTable = (
    <TableWrapper>
      <Table>
        <THead>
          <TR>
            <TH>דירה</TH>
            <TH>פרויקט</TH>
            <TH>סטטוס</TH>
            <TH className="text-left">שורות</TH>
            <TH className="text-left">סה&rdquo;כ כולל מע&rdquo;מ</TH>
            <TH className="text-left">עודכן</TH>
          </TR>
        </THead>
        <TBody>
          {sheets.map((sheet) => {
            const totals = computeTotals(sheet.lines, {
              discount: sheet.discount,
              vatRate: sheet.vatRate,
            });

            return (
              <TR key={sheet.id} className="hover:bg-surface-muted/70">
                <TD className="font-medium text-ink">
                  <Link
                    href={`/projects/${sheet.apartment.project.id}/apartments/${sheet.apartmentId}?tab=pricing`}
                    className="hover:text-brand-700"
                  >
                    דירה {sheet.apartment.number}
                  </Link>
                  <span className="mt-0.5 block text-[11px] text-ink-subtle">
                    {sheet.apartment.building.name}
                  </span>
                </TD>
                <TD className="text-ink-muted">{sheet.apartment.project.name}</TD>
                <TD>
                  <PricingStatusBadge status={sheet.status} />
                </TD>
                <TD className="font-numeric text-left">{sheet.lines.length}</TD>
                <TD className="font-numeric text-left font-semibold text-ink">
                  {formatCurrency(totals.total)}
                </TD>
                <TD className="font-numeric text-left text-ink-muted">
                  {formatDate(sheet.updatedAt)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrapper>
  );

  const tabs: UrlTab[] = [
    {
      key: "queue",
      label: "ממתין לתמחור",
      badge: awaitingPricing.length,
      content: (
        <ApartmentTable
          showProject
          rows={awaitingPricing.map((apartment) => ({
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
          }))}
          emptyTitle="אין דירות שממתינות לתמחור."
          emptyDescription="דירה עוברת לתמחור לאחר שהבדיקה המקצועית הושלמה."
        />
      ),
    },
    {
      key: "sheets",
      label: "גיליונות תמחור",
      badge: sheets.length,
      content:
        sheets.length === 0 ? (
          <EmptyState
            title="טרם הופקו גיליונות תמחור."
            description="גיליון תמחור מופק מהשינויים שאושרו בבדיקה המקצועית."
          />
        ) : (
          sheetsTable
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={NAV_LABELS.pricing}
        description="דירות שמוכנות לתמחור וגיליונות התמחור שהופקו."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="ממתין לתמחור" value={awaitingPricing.length} tone="brand" />
        <StatCard label="גיליונות תמחור" value={sheets.length} />
        <StatCard
          label="היקף כספי כולל"
          value={formatCurrency(totalValue, { decimals: false })}
          hint="סך כל גיליונות התמחור, כולל מע&rdquo;מ"
        />
      </div>

      <UrlTabs tabs={tabs} />
    </>
  );
}
