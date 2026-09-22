import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  CircleCheck,
  Receipt,
  UserCheck,
} from "lucide-react";

import { StatCard } from "@/components/domain/stat-card";
import { ApartmentStatusBadge } from "@/components/domain/status-badges";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, primaryRole } from "@/lib/auth/session";
import { PLATFORM_ADMIN_PATH } from "@/lib/auth/routing";
import { APARTMENT_STATUS_LABELS, APARTMENT_STATUS_TONE, ACTIVITY_KIND_LABELS } from "@/lib/i18n/he";
import { formatDate, formatRelative, plural } from "@/lib/i18n/format";
import {
  getApartmentStatusBreakdown,
  getAttentionItems,
  getRecentActivity,
} from "@/server/queries/dashboard";
import { getWorkloadCounts } from "@/server/queries/workload";
import { cn } from "@/lib/utils";

const BAR_COLORS: Record<string, string> = {
  neutral: "bg-ink-subtle",
  brand: "bg-brand-500",
  success: "bg-success-600",
  warning: "bg-warning-500",
  danger: "bg-danger-600",
  consultant: "bg-consultant-600",
};

export default async function DashboardPage() {
  const user = await requireUser();

  // מנהל־על מנהל את הפלטפורמה, לא ארגון מסוים — לוח הבקרה הארגוני אינו שלו
  if (user.isSuperAdmin) redirect(PLATFORM_ADMIN_PATH);

  const role = primaryRole(user);

  const [counts, attention, activity, breakdown] = await Promise.all([
    getWorkloadCounts(user),
    getAttentionItems(user),
    getRecentActivity(user, 8),
    getApartmentStatusBreakdown(user),
  ]);

  const firstName = user.name.split(" ")[0];
  const totalApartments = breakdown.reduce((sum, row) => sum + row.count, 0);

  const attentionRows = [
    {
      key: "review",
      count: attention.awaitingReview.length,
      text: `${attention.awaitingReview.length} ${plural(attention.awaitingReview.length, "דירה ממתינה", "דירות ממתינות")} לבדיקה שלך`,
      href: "/reviews",
      tone: "warning" as const,
      icon: ClipboardCheck,
      items: attention.awaitingReview.map((apartment) => ({
        id: apartment.id,
        title: `דירה ${apartment.number}`,
        subtitle: `${apartment.building.name} · ${apartment.project.name}`,
        meta: apartment.dueDate ? `יעד: ${formatDate(apartment.dueDate)}` : undefined,
        href: `/projects/${apartment.project.id}/apartments/${apartment.id}`,
      })),
    },
    {
      key: "consultant",
      count: attention.answeredRequests.length,
      text: `${attention.answeredRequests.length} ${plural(attention.answeredRequests.length, "תשובת יועץ התקבלה", "תשובות יועצים התקבלו")}`,
      href: "/consultants",
      tone: "consultant" as const,
      icon: UserCheck,
      items: attention.answeredRequests.map((request) => ({
        id: request.id,
        title: `דירה ${request.apartment.number} · ${request.code}`,
        subtitle: request.question,
        meta: formatRelative(request.responses[0]?.createdAt ?? request.updatedAt),
        href: `/projects/${request.apartment.project.id}/apartments/${request.apartment.id}?tab=consultants`,
      })),
    },
    {
      key: "correction",
      count: attention.needsCorrection.length,
      text: `${attention.needsCorrection.length} ${plural(attention.needsCorrection.length, "תוכנית חזרה", "תוכניות חזרו")} לתיקון`,
      href: "/reviews?status=NEEDS_CORRECTION",
      tone: "danger" as const,
      icon: AlertTriangle,
      items: attention.needsCorrection.map((apartment) => ({
        id: apartment.id,
        title: `דירה ${apartment.number}`,
        subtitle: `${apartment.building.name} · ${apartment.project.name}`,
        meta: undefined,
        href: `/projects/${apartment.project.id}/apartments/${apartment.id}`,
      })),
    },
    {
      key: "pricing",
      count: attention.awaitingPricing.length,
      text: `${attention.awaitingPricing.length} ${plural(attention.awaitingPricing.length, "דירה מוכנה", "דירות מוכנות")} לתמחור`,
      href: "/pricing",
      tone: "brand" as const,
      icon: Receipt,
      items: attention.awaitingPricing.map((apartment) => ({
        id: apartment.id,
        title: `דירה ${apartment.number}`,
        subtitle: `${apartment.building.name} · ${apartment.project.name}`,
        meta: undefined,
        href: `/projects/${apartment.project.id}/apartments/${apartment.id}?tab=pricing`,
      })),
    },
  ].filter((row) => row.count > 0);

  return (
    <>
      <PageHeader
        title={`בוקר טוב, ${firstName}`}
        description={
          role === "TENANT_CHANGE_MANAGER"
            ? "כל מה שדורש את תשומת הלב שלך היום, במקום אחד."
            : "מצב הפרויקטים והדירות שבאחריותך."
        }
      />

      <section aria-label="מדדים" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="פרויקטים פעילים"
          value={counts.activeProjects}
          href="/projects"
          icon={<Building2 className="size-4" />}
        />
        <StatCard
          label="דירות לבדיקה"
          value={counts.awaitingReview}
          tone="warning"
          href="/reviews"
          icon={<ClipboardCheck className="size-4" />}
        />
        <StatCard
          label="ממתין ליועץ"
          value={counts.awaitingConsultant}
          tone="consultant"
          href="/consultants"
          icon={<UserCheck className="size-4" />}
        />
        <StatCard
          label="ממתין לתמחור"
          value={counts.awaitingPricing}
          tone="brand"
          href="/pricing"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="נדרש תיקון"
          value={counts.needsCorrection}
          tone="danger"
          href="/reviews?status=NEEDS_CORRECTION"
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="מוכן לביצוע"
          value={counts.readyForExecution}
          tone="success"
          href="/apartments?status=APPROVED_FOR_EXECUTION"
          icon={<CircleCheck className="size-4" />}
        />
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-label="מה דורש את תשומת הלב שלי">
          <Card>
            <CardHeader>
              <CardTitle>מה דורש את תשומת הלב שלי</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {attentionRows.length === 0 ? (
                <EmptyState
                  icon={<CircleCheck className="size-5" />}
                  title="אין כרגע משימות שממתינות לך."
                  description="כשיועלו תוכניות חדשות או יתקבלו תשובות יועצים הן יופיעו כאן."
                />
              ) : (
                <div className="space-y-5">
                  {attentionRows.map((row) => (
                    <div key={row.key}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                          <row.icon
                            className={cn(
                              "size-4",
                              row.tone === "warning" && "text-warning-600",
                              row.tone === "danger" && "text-danger-600",
                              row.tone === "brand" && "text-brand-600",
                              row.tone === "consultant" && "text-consultant-600",
                            )}
                            aria-hidden
                          />
                          {row.text}
                        </p>
                        <Link
                          href={row.href}
                          className="text-[12px] font-medium text-brand-600 hover:text-brand-700"
                        >
                          הצג הכל
                        </Link>
                      </div>

                      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line">
                        {row.items.slice(0, 3).map((item) => (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              className="flex items-center gap-3 bg-surface px-4 py-2.5 transition-colors hover:bg-surface-muted"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-ink">
                                  {item.title}
                                </span>
                                <span className="block truncate text-[12px] text-ink-muted">
                                  {item.subtitle}
                                </span>
                              </span>
                              {item.meta ? (
                                <span className="font-numeric shrink-0 text-[11px] text-ink-subtle">
                                  {item.meta}
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>מצב הדירות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-2 w-full overflow-hidden rounded-pill bg-surface-sunken">
                {breakdown.map((row) => (
                  <div
                    key={row.status}
                    className={BAR_COLORS[APARTMENT_STATUS_TONE[row.status]]}
                    style={{ width: `${(row.count / Math.max(totalApartments, 1)) * 100}%` }}
                    title={`${APARTMENT_STATUS_LABELS[row.status]}: ${row.count}`}
                  />
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {breakdown
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((row) => (
                    <li key={row.status} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            BAR_COLORS[APARTMENT_STATUS_TONE[row.status]],
                          )}
                          aria-hidden
                        />
                        <span className="truncate text-[13px] text-ink-soft">
                          {APARTMENT_STATUS_LABELS[row.status]}
                        </span>
                      </span>
                      <span className="font-numeric text-[13px] font-medium text-ink">
                        {row.count}
                      </span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>פעילות אחרונה</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {activity.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-muted">
                  עדיין לא נרשמה פעילות.
                </p>
              ) : (
                <ul className="space-y-3.5">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5">
                      <Avatar name={entry.user?.name ?? "מערכת"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-5 text-ink-soft">{entry.message}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-subtle">
                          <span>{ACTIVITY_KIND_LABELS[entry.kind]}</span>
                          <span aria-hidden>·</span>
                          <span>{formatRelative(entry.createdAt)}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-6" aria-label="דירות אחרונות">
        <Card>
          <CardHeader>
            <CardTitle>דירות שנדרשת בהן פעולה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {attention.awaitingReview.length === 0 ? (
              <EmptyState
                title="אין כרגע דירות שממתינות לבדיקה."
                description="כשיועלו תוכניות חדשות הן יופיעו כאן."
              />
            ) : (
              <ul className="divide-y divide-line">
                {attention.awaitingReview.map((apartment) => (
                  <li key={apartment.id}>
                    <Link
                      href={`/projects/${apartment.project.id}/apartments/${apartment.id}`}
                      className="-mx-2 flex items-center gap-4 rounded-control px-2 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink">
                          דירה {apartment.number}
                        </span>
                        <span className="block text-[12px] text-ink-muted">
                          {apartment.building.name} · {apartment.buyerName ?? "ללא רוכש"} ·{" "}
                          {apartment.project.name}
                        </span>
                      </span>
                      <ApartmentStatusBadge status={apartment.status} />
                      <span className="font-numeric hidden w-24 shrink-0 text-left text-[12px] text-ink-subtle sm:block">
                        {apartment.dueDate ? formatDate(apartment.dueDate) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
