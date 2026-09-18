import Link from "next/link";
import { AlertTriangle, ArrowLeft, Lock, UserCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { compareQuantities } from "@/lib/drawing/compare";
import type { DrawingDocument } from "@/lib/drawing/types";
import { formatDate, formatNumber, UNIT_LABELS } from "@/lib/i18n/format";
import { CHANGE_CATEGORY_LABELS } from "@/lib/i18n/he";
import type { ChangeItemView } from "./types";
import { cn } from "@/lib/utils";

export function OverviewPanel({
  documents,
  changes,
  apartment,
}: {
  documents: { standard: DrawingDocument | null; modified: DrawingDocument | null };
  changes: ChangeItemView[];
  apartment: {
    buyerName: string | null;
    buyerContact: string | null;
    apartmentTypeName: string | null;
    managerName: string | null;
    coordinatorName: string | null;
    dueDate: Date | null;
    projectName: string;
    developerName: string | null;
    contractorName: string | null;
  };
}) {
  const quantities =
    documents.standard && documents.modified
      ? compareQuantities(documents.standard, documents.modified)
          .filter((row) => row.standard > 0 || row.modified > 0)
          .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      : [];

  const pending = changes.filter((change) => change.status === "DETECTED");
  const awaitingConsultant = changes.filter(
    (change) => change.status === "AWAITING_CONSULTANT" || change.requiresConsultant,
  );
  const blocking = changes.filter((change) => change.blockedFromAutomation);
  const decided = changes.filter(
    (change) => change.status !== "DETECTED" && change.status !== "AWAITING_CONSULTANT",
  );

  const byCategory = new Map<string, number>();
  for (const change of changes) {
    byCategory.set(change.categoryKey, (byCategory.get(change.categoryKey) ?? 0) + 1);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>מה מונע התקדמות</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2.5">
              <BlockerRow
                tone={pending.length > 0 ? "warning" : "success"}
                icon={<AlertTriangle className="size-4" />}
                title={
                  pending.length > 0
                    ? `${pending.length} שינויים ממתינים לבדיקה שלך`
                    : "כל השינויים נבדקו"
                }
                description={
                  pending.length > 0
                    ? "יש לאשר, לתקן או לדחות כל שינוי לפני המעבר לתמחור."
                    : "אין שינויים שממתינים להכרעה."
                }
              />
              <BlockerRow
                tone={awaitingConsultant.length > 0 ? "consultant" : "success"}
                icon={<UserCheck className="size-4" />}
                title={
                  awaitingConsultant.length > 0
                    ? `${awaitingConsultant.length} שינויים דורשים אישור יועץ`
                    : "אין שינויים שדורשים יועץ"
                }
                description={
                  awaitingConsultant.length > 0
                    ? "לפי כללי הפרויקט, שינויים אלה אינם ממשיכים לתמחור ללא אישור מקצועי."
                    : "לא נמצאה דרישה לאישור יועץ לפי כללי הפרויקט."
                }
              />
              {blocking.length > 0 ? (
                <BlockerRow
                  tone="danger"
                  icon={<Lock className="size-4" />}
                  title={`${blocking.length} שינויים חוסמים המשך אוטומטי`}
                  description="נדרשת הכרעה של גורם מקצועי מורשה לפני כל המשך."
                />
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>השוואת כמויות — סטנדרט מול שינויים</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {quantities.length === 0 ? (
              <p className="py-4 text-[13px] text-ink-muted">
                השוואת הכמויות תופיע לאחר העלאת תוכנית שינויים.
              </p>
            ) : (
              <TableWrapper className="border-0 shadow-none">
                <Table>
                  <THead>
                    <TR>
                      <TH>פריט</TH>
                      <TH className="text-left">סטנדרט</TH>
                      <TH className="text-left">שינויים</TH>
                      <TH className="text-left">הפרש</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {quantities.map((row) => (
                      <TR key={row.elementType}>
                        <TD className="font-medium text-ink">{row.label}</TD>
                        <TD className="font-numeric text-left">
                          {formatNumber(row.standard, row.unit === "METER" ? 1 : 0)}
                        </TD>
                        <TD className="font-numeric text-left">
                          {formatNumber(row.modified, row.unit === "METER" ? 1 : 0)}
                        </TD>
                        <TD className="text-left">
                          <span
                            className={cn(
                              "font-numeric font-semibold",
                              row.difference > 0 && "text-success-700",
                              row.difference < 0 && "text-danger-700",
                              row.difference === 0 && "text-ink-subtle",
                            )}
                          >
                            {row.difference > 0 ? "+" : ""}
                            {formatNumber(row.difference, row.unit === "METER" ? 1 : 0)}
                            {row.unit === "METER" ? ` ${UNIT_LABELS.METER}` : ""}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>פרטי הדירה</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Detail label="רוכש" value={apartment.buyerName ?? "—"} />
              <Detail label="טלפון" value={apartment.buyerContact ?? "—"} numeric />
              <Detail label="טיפוס" value={apartment.apartmentTypeName ?? "—"} />
              <Detail label="מנהלת שינויי דיירים" value={apartment.managerName ?? "—"} />
              <Detail label="מתאמת" value={apartment.coordinatorName ?? "—"} />
              <Detail
                label="תאריך יעד"
                value={apartment.dueDate ? formatDate(apartment.dueDate) : "—"}
                numeric
              />
              <Detail label="פרויקט" value={apartment.projectName} />
              <Detail label="יזם" value={apartment.developerName ?? "—"} />
              <Detail label="קבלן מבצע" value={apartment.contractorName ?? "—"} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>שינויים לפי קטגוריה</CardTitle>
          </CardHeader>
          <CardContent>
            {byCategory.size === 0 ? (
              <p className="text-[13px] text-ink-muted">טרם זוהו שינויים.</p>
            ) : (
              <ul className="space-y-2">
                {[...byCategory.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([categoryKey, count]) => (
                    <li key={categoryKey} className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-ink-soft">
                        {CHANGE_CATEGORY_LABELS[categoryKey as keyof typeof CHANGE_CATEGORY_LABELS]}
                      </span>
                      <span className="font-numeric text-[13px] font-medium text-ink">{count}</span>
                    </li>
                  ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="text-[13px] text-ink-muted">הוכרעו</span>
              <span className="font-numeric text-[13px] font-medium text-ink">
                {decided.length} / {changes.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-[13px] font-medium text-ink",
          numeric && "font-numeric",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BlockerRow({
  tone,
  icon,
  title,
  description,
}: {
  tone: "warning" | "danger" | "success" | "consultant";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const toneClass = {
    warning: "border-warning-100 bg-warning-50 text-warning-700",
    danger: "border-danger-100 bg-danger-50 text-danger-700",
    success: "border-success-100 bg-success-50 text-success-700",
    consultant: "border-consultant-100 bg-consultant-50 text-consultant-700",
  }[tone];

  return (
    <li className={cn("flex items-start gap-2.5 rounded-card border px-3.5 py-3", toneClass)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-5 opacity-85">{description}</span>
      </span>
    </li>
  );
}

export function NextStepBanner({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-200 bg-brand-50/70 px-4 py-3">
      <div>
        <p className="text-[13px] font-semibold text-brand-800">{title}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-brand-700/80">{description}</p>
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:text-brand-800"
        >
          {linkLabel}
          <ArrowLeft className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: "brand" | "warning" }) {
  return <Badge tone={tone}>{label}</Badge>;
}
