import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

import { PlanVersionStatusBadge } from "@/components/domain/status-badges";
import { FilterBar } from "@/components/domain/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/i18n/format";
import { FILE_KIND_LABELS, NAV_LABELS, PLAN_KIND_LABELS } from "@/lib/i18n/he";
import { projectScopeFor } from "@/server/queries/workload";

export const metadata: Metadata = { title: NAV_LABELS.documents };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { project, q } = await searchParams;

  const [versions, projects] = await Promise.all([
    prisma.planVersion.findMany({
      where: {
        plan: {
          apartment: {
            project: { ...projectScopeFor(user), ...(project ? { id: project } : {}) },
            ...(q ? { number: { startsWith: q } } : {}),
          },
        },
      },
      include: {
        author: { select: { name: true } },
        drawingFiles: true,
        plan: {
          include: {
            apartment: {
              include: {
                building: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.project.findMany({
      where: projectScopeFor(user),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={NAV_LABELS.documents}
        description="כל גרסאות התוכניות במערכת. גרסה מאושרת לעולם אינה נדרסת."
      />

      <FilterBar
        searchPlaceholder="מספר דירה"
        filters={[
          {
            name: "project",
            label: "פרויקט",
            options: projects.map((item) => ({ value: item.id, label: item.name })),
          },
        ]}
      />

      {versions.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="לא נמצאו מסמכים."
          description="תוכניות שיועלו למערכת יופיעו כאן לפי גרסאות."
        />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>מסמך</TH>
                <TH>דירה</TH>
                <TH>סוג</TH>
                <TH>הועלה על ידי</TH>
                <TH>סטטוס</TH>
                <TH className="text-left">קבצים</TH>
                <TH className="text-left">תאריך</TH>
              </TR>
            </THead>
            <TBody>
              {versions.map((version) => {
                const apartment = version.plan.apartment;
                return (
                  <TR key={version.id} className="hover:bg-surface-muted/70">
                    <TD className="font-medium text-ink">
                      <span className="font-numeric me-1.5 rounded-control bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-soft">
                        v{version.versionNo}
                      </span>
                      {version.title}
                    </TD>
                    <TD>
                      {apartment ? (
                        <Link
                          href={`/projects/${apartment.project.id}/apartments/${apartment.id}?tab=plans`}
                          className="text-brand-600 hover:text-brand-700"
                        >
                          דירה {apartment.number}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {apartment ? (
                        <span className="mt-0.5 block text-[11px] text-ink-subtle">
                          {apartment.building.name} · {apartment.project.name}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-ink-muted">{PLAN_KIND_LABELS[version.plan.kind]}</TD>
                    <TD>{version.author?.name ?? "—"}</TD>
                    <TD>
                      <PlanVersionStatusBadge status={version.status} />
                    </TD>
                    <TD className="text-left text-[12px] text-ink-muted">
                      {version.drawingFiles.length === 0
                        ? "מודל פנימי"
                        : version.drawingFiles
                            .map((file) => FILE_KIND_LABELS[file.kind])
                            .join(", ")}
                    </TD>
                    <TD className="font-numeric text-left text-ink-muted">
                      {formatDate(version.createdAt)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </>
  );
}
