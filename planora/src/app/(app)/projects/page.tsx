import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { PROJECT_STATUS_LABELS, NAV_LABELS } from "@/lib/i18n/he";
import { formatDate } from "@/lib/i18n/format";
import { getActiveProjects } from "@/server/queries/dashboard";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: NAV_LABELS.projects };

const STATUS_TONE = {
  PLANNING: "neutral",
  ACTIVE: "brand",
  TENANT_CHANGES: "brand",
  EXECUTION: "warning",
  COMPLETED: "success",
  ARCHIVED: "neutral",
} as const;

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await getActiveProjects(user);

  const counts = await prisma.apartment.groupBy({
    by: ["projectId", "status"],
    where: { projectId: { in: projects.map((project) => project.id) } },
    _count: { _all: true },
  });

  return (
    <>
      <PageHeader
        title={NAV_LABELS.projects}
        description="כל הפרויקטים שבאחריות הארגון שלך, כולל פרויקטים של יזמים וקבלנים שונים."
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="אין עדיין פרויקטים."
          description="פרויקט חדש ייווצר על ידי מנהל הארגון ויופיע כאן."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const projectCounts = counts.filter((row) => row.projectId === project.id);
            const awaitingReview =
              projectCounts.find((row) => row.status === "AWAITING_REVIEW")?._count._all ?? 0;
            const awaitingPricing =
              projectCounts.find((row) => row.status === "AWAITING_PRICING")?._count._all ?? 0;

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-line-strong">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-[15px] font-semibold text-ink group-hover:text-brand-700">
                          {project.name}
                        </h2>
                        <p className="mt-1 truncate text-[12px] text-ink-muted">
                          {[project.developerName, project.city].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>

                    {project.description ? (
                      <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-ink-muted">
                        {project.description}
                      </p>
                    ) : null}

                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
                      <div>
                        <dt className="text-[11px] text-ink-subtle">דירות</dt>
                        <dd className="font-numeric mt-0.5 text-[15px] font-semibold text-ink">
                          {project._count.apartments}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-subtle">לבדיקה</dt>
                        <dd className="font-numeric mt-0.5 text-[15px] font-semibold text-warning-700">
                          {awaitingReview}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-subtle">לתמחור</dt>
                        <dd className="font-numeric mt-0.5 text-[15px] font-semibold text-brand-700">
                          {awaitingPricing}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-3 flex items-center justify-between text-[11px] text-ink-subtle">
                      <span>
                        מנהלת שינויי דיירים: {project.tenantChangeManager?.name ?? "לא שויכה"}
                      </span>
                      {project.changeDeadline ? (
                        <span className="font-numeric">
                          סגירה: {formatDate(project.changeDeadline)}
                        </span>
                      ) : null}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
