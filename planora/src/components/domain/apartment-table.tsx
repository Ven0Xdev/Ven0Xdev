import Link from "next/link";

import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { ApartmentStatusBadge } from "@/components/domain/status-badges";
import { EmptyState } from "@/components/ui/misc";
import { formatDate } from "@/lib/i18n/format";
import type { ApartmentStatus } from "@prisma/client";

export interface ApartmentRow {
  id: string;
  number: string;
  buildingName: string;
  floorNumber: number;
  typeName: string | null;
  buyerName: string | null;
  status: ApartmentStatus;
  dueDate: Date | null;
  projectId: string;
  projectName: string;
  changeCount?: number;
  managerName?: string | null;
}

export function ApartmentTable({
  rows,
  showProject = false,
  emptyTitle = "אין דירות להצגה.",
  emptyDescription = "כשיתווספו דירות הן יופיעו כאן.",
}: {
  rows: ApartmentRow[];
  showProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <TableWrapper>
      <Table>
        <THead>
          <TR>
            <TH>דירה</TH>
            <TH>בניין וקומה</TH>
            <TH>טיפוס</TH>
            <TH>רוכש</TH>
            {showProject ? <TH>פרויקט</TH> : null}
            <TH>סטטוס</TH>
            <TH className="text-left">שינויים</TH>
            <TH className="text-left">תאריך יעד</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id} className="hover:bg-surface-muted/70">
              <TD className="font-medium text-ink">
                <Link
                  href={`/projects/${row.projectId}/apartments/${row.id}`}
                  className="block hover:text-brand-700"
                >
                  דירה {row.number}
                </Link>
              </TD>
              <TD>
                {row.buildingName} · קומה {row.floorNumber}
              </TD>
              <TD className="text-ink-muted">{row.typeName ?? "—"}</TD>
              <TD>{row.buyerName ?? "—"}</TD>
              {showProject ? <TD className="text-ink-muted">{row.projectName}</TD> : null}
              <TD>
                <ApartmentStatusBadge status={row.status} />
              </TD>
              <TD className="font-numeric text-left">
                {row.changeCount !== undefined ? row.changeCount : "—"}
              </TD>
              <TD className="font-numeric text-left text-ink-muted">
                {row.dueDate ? formatDate(row.dueDate) : "—"}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}
