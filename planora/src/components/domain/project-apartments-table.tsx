"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Search } from "lucide-react";
import type { ApartmentStatus, PaymentStatus } from "@prisma/client";

import { ApartmentStatusBadge } from "@/components/domain/status-badges";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { formatCurrency } from "@/lib/i18n/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/tenant/journey";
import { WORK_QUEUES, matchesQueue, type WorkQueue } from "@/lib/tenant/queue";
import { cn } from "@/lib/utils";

export interface ProjectApartmentRow {
  id: string;
  number: string;
  floorNumber: number;
  buildingName: string;
  tenantName: string | null;
  hasTenantAccount: boolean;
  status: ApartmentStatus;
  paymentStatus: PaymentStatus;
  changeCount: number;
  openConsultantRequests: number;
  pricingTotal: number | null;
  managerName: string | null;
  projectId: string;
}

const QUEUE_ORDER: WorkQueue[] = [
  "WAITING_FOR_ME",
  "WAITING_FOR_TENANT",
  "WAITING_FOR_CONSULTANT",
  "WAITING_FOR_PRICING",
  "READY_FOR_EXECUTION",
];

export function ProjectApartmentsTable({ rows }: { rows: ProjectApartmentRow[] }) {
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const result = {} as Record<WorkQueue, number>;
    for (const key of QUEUE_ORDER) {
      result[key] = rows.filter((row) => matchesQueue(row.status, key)).length;
    }
    return result;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = query.trim();
    return rows.filter((row) => {
      if (queue && !matchesQueue(row.status, queue)) return false;
      if (!term) return true;
      return (
        row.number.startsWith(term) ||
        (row.tenantName ?? "").includes(term)
      );
    });
  }, [rows, queue, query]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="מספר דירה או שם דייר"
            aria-label="חיפוש דירה"
            className="pe-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="הכל"
            count={rows.length}
            isActive={queue === null}
            onClick={() => setQueue(null)}
          />
          {QUEUE_ORDER.map((key) => (
            <FilterChip
              key={key}
              label={WORK_QUEUES[key]}
              count={counts[key]}
              isActive={queue === key}
              onClick={() => setQueue(queue === key ? null : key)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="אין דירות שתואמות לסינון."
          description="אפשר לנקות את הסינון או לבחור תור אחר."
        />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>דירה</TH>
                <TH>דייר</TH>
                <TH className="text-left">קומה</TH>
                <TH>סטטוס</TH>
                <TH className="text-left">שינויים</TH>
                <TH className="text-left">יועץ</TH>
                <TH className="text-left">תמחור</TH>
                <TH>תשלום</TH>
                <TH>אחראית</TH>
                <TH className="w-12" />
              </TR>
            </THead>
            <TBody>
              {filtered.map((row) => (
                <TR key={row.id} className="hover:bg-surface-muted/70">
                  <TD className="font-medium text-ink">
                    <Link
                      href={`/projects/${row.projectId}/apartments/${row.id}`}
                      className="hover:text-brand-700"
                    >
                      דירה {row.number}
                    </Link>
                  </TD>
                  <TD>
                    {row.tenantName ?? "—"}
                    {row.hasTenantAccount ? (
                      <span className="mt-0.5 block text-[11px] text-success-700">
                        חשבון פעיל
                      </span>
                    ) : row.tenantName ? (
                      <span className="mt-0.5 block text-[11px] text-ink-subtle">ללא חשבון</span>
                    ) : null}
                  </TD>
                  <TD className="font-numeric text-left text-ink-muted">{row.floorNumber}</TD>
                  <TD>
                    <ApartmentStatusBadge status={row.status} />
                  </TD>
                  <TD className="font-numeric text-left">{row.changeCount || "—"}</TD>
                  <TD className="font-numeric text-left">
                    {row.openConsultantRequests > 0 ? (
                      <span className="text-consultant-700">{row.openConsultantRequests}</span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="font-numeric text-left">
                    {row.pricingTotal !== null
                      ? formatCurrency(row.pricingTotal, { decimals: false })
                      : "—"}
                  </TD>
                  <TD className="text-[12px] text-ink-muted">
                    {PAYMENT_STATUS_LABELS[row.paymentStatus]}
                  </TD>
                  <TD className="text-ink-muted">{row.managerName ?? "—"}</TD>
                  <TD className="text-left">
                    {row.hasTenantAccount ? (
                      <Link
                        href={`/projects/${row.projectId}/apartments/${row.id}/tenant-preview`}
                        aria-label={`תצוגת דייר לדירה ${row.number}`}
                        title="תצוגת דייר"
                        className="inline-flex size-7 items-center justify-center rounded-control text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
                      >
                        <Eye className="size-3.5" aria-hidden />
                      </Link>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </>
  );
}

function FilterChip({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        "flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12px] font-medium transition-colors",
        isActive
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-line-strong bg-surface text-ink-muted hover:text-ink",
      )}
    >
      {label}
      <span className={cn("font-numeric", isActive ? "text-brand-600" : "text-ink-subtle")}>
        {count}
      </span>
    </button>
  );
}
