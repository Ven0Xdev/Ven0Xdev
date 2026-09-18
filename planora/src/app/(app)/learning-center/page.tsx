import type { Metadata } from "next";
import { Info } from "lucide-react";

import { CategoryChart } from "@/components/domain/category-chart";
import { StatCard } from "@/components/domain/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatPercent } from "@/lib/i18n/format";
import { CHANGE_CATEGORY_LABELS, NAV_LABELS } from "@/lib/i18n/he";
import { apartmentScopeFor } from "@/server/queries/workload";
import { confidenceLabel, confidencePercent } from "@/lib/changes/confidence";

export const metadata: Metadata = { title: NAV_LABELS.learningCenter };

export default async function LearningCenterPage() {
  const user = await requireUser();
  const scope = apartmentScopeFor(user);

  const [reviewsCount, detections, corrections, byCategory, correctionsByCategory, avgConfidence] =
    await Promise.all([
      prisma.review.count({
        where: { apartment: scope, status: { in: ["COMPLETED", "RETURNED_FOR_CORRECTION"] } },
      }),
      prisma.changeItem.count({ where: { changeSet: { apartment: scope } } }),
      prisma.aITrainingCorrection.count({
        where: { changeItem: { changeSet: { apartment: scope } } },
      }),
      prisma.changeItem.groupBy({
        by: ["categoryKey"],
        where: { changeSet: { apartment: scope } },
        _count: { _all: true },
        _avg: { confidence: true },
      }),
      prisma.aITrainingCorrection.groupBy({
        by: ["correctedCategory"],
        where: { changeItem: { changeSet: { apartment: scope } } },
        _count: { _all: true },
      }),
      prisma.changeItem.aggregate({
        where: { changeSet: { apartment: scope } },
        _avg: { confidence: true },
      }),
    ]);

  const correctionMap = new Map(
    correctionsByCategory.map((row) => [row.correctedCategory, row._count._all]),
  );

  const rows = byCategory
    .map((row) => {
      const detected = row._count._all;
      const corrected = correctionMap.get(row.categoryKey) ?? 0;
      return {
        key: row.categoryKey,
        label: CHANGE_CATEGORY_LABELS[row.categoryKey],
        detections: detected,
        corrections: corrected,
        agreement: detected > 0 ? (detected - corrected) / detected : 1,
        averageConfidence: row._avg.confidence ?? 0,
      };
    })
    .sort((a, b) => b.detections - a.detections);

  const overallAgreement = detections > 0 ? (detections - corrections) / detections : 1;

  return (
    <>
      <PageHeader
        title={NAV_LABELS.learningCenter}
        description="מדדי הזיהוי של המערכת מול הבדיקות האנושיות שבוצעו בפועל."
      />

      <p className="mb-5 flex items-start gap-2 rounded-card border border-line bg-surface px-4 py-3 text-[12px] leading-5 text-ink-muted shadow-subtle">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        <span>
          המדדים כאן מתארים את שיעור ההתאמה בין הזיהוי האוטומטי לבין הבדיקה של אנשי המקצוע.
          הם אינם מדד לעמידה בתקן ואינם מהווים אישור הנדסי. תיקון של מנהלת שינויי הדיירים
          נשמר לצורכי שיפור עתידי — אין אימון אוטומטי בזמן אמת.
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="בדיקות שבוצעו" value={reviewsCount} />
        <StatCard label="זיהויים" value={detections} />
        <StatCard label="תיקוני סיווג" value={corrections} tone="warning" />
        <StatCard
          label="שיעור התאמה לבדיקות אנושיות"
          value={formatPercent(overallAgreement, 1)}
          tone="success"
          hint={`רמת ודאות ממוצעת בזיהוי: ${formatPercent(avgConfidence._avg.confidence ?? 0, 1)}`}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>זיהויים ותיקונים לפי קטגוריה</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-muted">
                עדיין אין מספיק נתונים להצגה.
              </p>
            ) : (
              <>
                <CategoryChart
                  data={rows.map((row) => ({
                    label: row.label,
                    detections: row.detections,
                    corrections: row.corrections,
                    agreement: row.agreement,
                  }))}
                />
                <ul className="mt-3 flex items-center gap-5">
                  <li className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <span className="size-2.5 rounded-sm bg-brand-400" aria-hidden />
                    זיהויים
                  </li>
                  <li className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <span className="size-2.5 rounded-sm bg-warning-400" aria-hidden />
                    תיקוני סיווג
                  </li>
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>פילוח מפורט</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TableWrapper className="border-0 shadow-none">
              <Table>
                <THead>
                  <TR>
                    <TH>קטגוריה</TH>
                    <TH className="text-left">זיהויים</TH>
                    <TH className="text-left">תיקונים</TH>
                    <TH className="text-left">התאמה</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.key}>
                      <TD className="font-medium text-ink">
                        {row.label}
                        <span className="mt-0.5 block text-[11px] text-ink-subtle">
                          {confidenceLabel(row.averageConfidence)} ·{" "}
                          <span className="font-numeric">
                            {confidencePercent(row.averageConfidence)}
                          </span>
                        </span>
                      </TD>
                      <TD className="font-numeric text-left">{row.detections}</TD>
                      <TD className="font-numeric text-left">{row.corrections}</TD>
                      <TD className="font-numeric text-left font-medium text-ink">
                        {formatPercent(row.agreement, 1)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
