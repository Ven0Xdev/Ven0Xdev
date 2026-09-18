import type { Metadata } from "next";

import { StatCard } from "@/components/domain/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeTotals } from "@/lib/pricing/engine";
import { formatCurrency, formatNumber } from "@/lib/i18n/format";
import {
  APARTMENT_STATUS_LABELS,
  CHANGE_CATEGORY_LABELS,
  CHANGE_TYPE_LABELS,
  NAV_LABELS,
} from "@/lib/i18n/he";
import { apartmentScopeFor, projectScopeFor } from "@/server/queries/workload";

export const metadata: Metadata = { title: NAV_LABELS.reports };

export default async function ReportsPage() {
  const user = await requireUser();
  const scope = apartmentScopeFor(user);

  const [projects, statusGroups, categoryGroups, sheets, changeCount, consultantStats] =
    await Promise.all([
      prisma.project.findMany({
        where: projectScopeFor(user),
        select: { id: true, name: true, _count: { select: { apartments: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.apartment.groupBy({
        by: ["projectId", "status"],
        where: scope,
        _count: { _all: true },
      }),
      prisma.changeItem.groupBy({
        by: ["categoryKey", "type"],
        where: { changeSet: { apartment: scope } },
        _count: { _all: true },
      }),
      prisma.pricingSheet.findMany({
        where: { apartment: scope },
        include: { lines: true },
      }),
      prisma.changeItem.count({ where: { changeSet: { apartment: scope } } }),
      prisma.consultantRequest.groupBy({
        by: ["kind", "status"],
        where: { apartment: scope },
        _count: { _all: true },
      }),
    ]);

  const totalValue = sheets.reduce(
    (sum, sheet) =>
      sum + computeTotals(sheet.lines, { discount: sheet.discount, vatRate: sheet.vatRate }).total,
    0,
  );

  const apartmentsWithChanges = new Set(
    (
      await prisma.changeSet.findMany({ where: { apartment: scope }, select: { apartmentId: true } })
    ).map((row) => row.apartmentId),
  ).size;

  const averagePerApartment =
    apartmentsWithChanges > 0 ? changeCount / apartmentsWithChanges : 0;

  const statusByProject = new Map<string, { status: string; count: number }[]>();
  for (const group of statusGroups) {
    const list = statusByProject.get(group.projectId) ?? [];
    list.push({ status: group.status, count: group._count._all });
    statusByProject.set(group.projectId, list);
  }

  return (
    <>
      <PageHeader
        title={NAV_LABELS.reports}
        description="תמונת מצב רוחבית על הפרויקטים, השינויים והיקף התמחור."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="סך שינויים שזוהו" value={changeCount} />
        <StatCard
          label="ממוצע שינויים לדירה"
          value={formatNumber(averagePerApartment, 1)}
          hint={`${apartmentsWithChanges} דירות עם תוכנית שינויים`}
        />
        <StatCard label="גיליונות תמחור" value={sheets.length} />
        <StatCard
          label="היקף כספי כולל"
          value={formatCurrency(totalValue, { decimals: false })}
          tone="brand"
          hint="כולל מע&rdquo;מ"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>מצב הדירות לפי פרויקט</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TableWrapper className="border-0 shadow-none">
              <Table>
                <THead>
                  <TR>
                    <TH>פרויקט</TH>
                    <TH className="text-left">דירות</TH>
                    <TH>פירוט</TH>
                  </TR>
                </THead>
                <TBody>
                  {projects.map((project) => (
                    <TR key={project.id}>
                      <TD className="font-medium text-ink">{project.name}</TD>
                      <TD className="font-numeric text-left">{project._count.apartments}</TD>
                      <TD>
                        <ul className="flex flex-wrap gap-x-3 gap-y-1">
                          {(statusByProject.get(project.id) ?? [])
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 4)
                            .map((entry) => (
                              <li key={entry.status} className="text-[12px] text-ink-muted">
                                {
                                  APARTMENT_STATUS_LABELS[
                                    entry.status as keyof typeof APARTMENT_STATUS_LABELS
                                  ]
                                }{" "}
                                <span className="font-numeric font-medium text-ink">
                                  {entry.count}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>שינויים לפי קטגוריה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TableWrapper className="border-0 shadow-none">
              <Table>
                <THead>
                  <TR>
                    <TH>קטגוריה</TH>
                    <TH>סוג</TH>
                    <TH className="text-left">כמות</TH>
                  </TR>
                </THead>
                <TBody>
                  {categoryGroups
                    .slice()
                    .sort((a, b) => b._count._all - a._count._all)
                    .map((group) => (
                      <TR key={`${group.categoryKey}-${group.type}`}>
                        <TD className="font-medium text-ink">
                          {CHANGE_CATEGORY_LABELS[group.categoryKey]}
                        </TD>
                        <TD className="text-ink-muted">{CHANGE_TYPE_LABELS[group.type]}</TD>
                        <TD className="font-numeric text-left">{group._count._all}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>בקשות יועצים</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {consultantStats.length === 0 ? (
            <p className="py-6 text-[13px] text-ink-muted">טרם נשלחו בקשות ליועצים.</p>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {consultantStats.map((stat) => (
                <li
                  key={`${stat.kind}-${stat.status}`}
                  className="rounded-card border border-line px-4 py-3"
                >
                  <p className="text-[12px] text-ink-muted">
                    {stat.kind === "PLUMBING"
                      ? "אינסטלציה"
                      : stat.kind === "HVAC"
                        ? "מיזוג"
                        : stat.kind === "ELECTRICAL"
                          ? "חשמל"
                          : stat.kind === "STRUCTURAL"
                            ? "קונסטרוקציה"
                            : stat.kind === "ARCHITECT"
                              ? "אדריכל"
                              : "אחר"}
                  </p>
                  <p className="font-numeric mt-1 text-lg font-semibold text-ink">
                    {stat._count._all}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {stat.status === "PENDING"
                      ? "ממתין לתשובה"
                      : stat.status === "ANSWERED"
                        ? "התקבלה תשובה"
                        : "בוטלה"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
