import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { AssignmentStatusBadge } from "@/components/domain/status-badges";
import { StatCard } from "@/components/domain/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate, plural } from "@/lib/i18n/format";
import { ASSIGNMENT_KIND_LABELS, NAV_LABELS } from "@/lib/i18n/he";
import { getAttentionItems } from "@/server/queries/dashboard";
import { getWorkloadCounts } from "@/server/queries/workload";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: NAV_LABELS.myWork };

export default async function MyWorkPage() {
  const user = await requireUser();

  const [assignments, attention, counts] = await Promise.all([
    prisma.professionalAssignment.findMany({
      where: { assigneeId: user.id },
      include: {
        project: { select: { id: true, name: true } },
        apartment: { select: { id: true, number: true, projectId: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    getAttentionItems(user),
    getWorkloadCounts(user),
  ]);

  const open = assignments.filter(
    (assignment) => assignment.status === "OPEN" || assignment.status === "IN_PROGRESS",
  );
  const done = assignments.filter((assignment) => assignment.status === "DONE");
  const today = new Date();

  const queues = [
    {
      title: "תוכניות שממתינות לבדיקה שלי",
      items: attention.awaitingReview.map((apartment) => ({
        id: apartment.id,
        title: `דירה ${apartment.number}`,
        subtitle: `${apartment.building.name} · ${apartment.project.name}`,
        href: `/projects/${apartment.project.id}/apartments/${apartment.id}?tab=changes`,
      })),
    },
    {
      title: "תשובות יועצים שחזרו",
      items: attention.answeredRequests.map((request) => ({
        id: request.id,
        title: `דירה ${request.apartment.number} · ${request.code}`,
        subtitle: request.question,
        href: `/projects/${request.apartment.project.id}/apartments/${request.apartment.id}?tab=consultants`,
      })),
    },
    {
      title: "תוכניות שחזרו לתיקון",
      items: attention.needsCorrection.map((apartment) => ({
        id: apartment.id,
        title: `דירה ${apartment.number}`,
        subtitle: `${apartment.building.name} · ${apartment.project.name}`,
        href: `/projects/${apartment.project.id}/apartments/${apartment.id}`,
      })),
    },
    {
      title: "דירות שמוכנות לתמחור",
      items: attention.awaitingPricing.map((apartment) => ({
        id: apartment.id,
        title: `דירה ${apartment.number}`,
        subtitle: `${apartment.building.name} · ${apartment.project.name}`,
        href: `/projects/${apartment.project.id}/apartments/${apartment.id}?tab=pricing`,
      })),
    },
  ].filter((queue) => queue.items.length > 0);

  return (
    <>
      <PageHeader
        title={NAV_LABELS.myWork}
        description="המשימות והתורים שממתינים לך, לפי סדר הטיפול."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="משימות פתוחות" value={open.length} tone="warning" />
        <StatCard label="דירות לבדיקה" value={counts.awaitingReview} href="/reviews" />
        <StatCard
          label="תשובות יועצים"
          value={attention.answeredRequests.length}
          tone="consultant"
          href="/consultants"
        />
        <StatCard label="מוכן לתמחור" value={counts.awaitingPricing} tone="brand" href="/pricing" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>המשימות שלי</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {open.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="size-5" />}
                title="אין כרגע משימות פתוחות."
                description="משימה שתשויך אליך תופיע כאן."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <ul className="divide-y divide-line">
                {open.map((assignment) => {
                  const isOverdue =
                    assignment.dueDate && assignment.dueDate.getTime() < today.getTime();

                  const href = assignment.apartment
                    ? `/projects/${assignment.apartment.projectId}/apartments/${assignment.apartment.id}`
                    : `/projects/${assignment.projectId}`;

                  return (
                    <li key={assignment.id} className="py-3">
                      <Link href={href} className="-mx-2 block rounded-control px-2 py-1 hover:bg-surface-muted">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-ink">{assignment.title}</p>
                            {assignment.description ? (
                              <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">
                                {assignment.description}
                              </p>
                            ) : null}
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-subtle">
                              <span>{ASSIGNMENT_KIND_LABELS[assignment.kind]}</span>
                              <span aria-hidden>·</span>
                              <span>{assignment.project.name}</span>
                              {assignment.dueDate ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <span
                                    className={cn(
                                      "font-numeric",
                                      isOverdue && "font-medium text-danger-600",
                                    )}
                                  >
                                    יעד: {formatDate(assignment.dueDate)}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <AssignmentStatusBadge status={assignment.status} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {done.length > 0 ? (
              <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-subtle">
                {done.length} {plural(done.length, "משימה הושלמה", "משימות הושלמו")}.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {queues.length === 0 ? (
            <EmptyState
              title="אין כרגע תורים שממתינים לך."
              description="כשיועלו תוכניות חדשות או יתקבלו תשובות יועצים הן יופיעו כאן."
            />
          ) : (
            queues.map((queue) => (
              <Card key={queue.title}>
                <CardHeader>
                  <CardTitle>{queue.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-line">
                    {queue.items.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="-mx-2 block rounded-control px-2 py-2.5 transition-colors hover:bg-surface-muted"
                        >
                          <span className="block text-[13px] font-medium text-ink">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                            {item.subtitle}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
