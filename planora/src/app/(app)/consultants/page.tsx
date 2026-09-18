import type { Metadata } from "next";
import Link from "next/link";

import {
  ConsultantDecisionBadge,
  ConsultantRequestStatusBadge,
} from "@/components/domain/status-badges";
import { StatCard } from "@/components/domain/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { UrlTabs, type UrlTab } from "@/components/ui/url-tabs";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/i18n/format";
import { CONSULTANT_KIND_LABELS, NAV_LABELS } from "@/lib/i18n/he";
import { apartmentScopeFor } from "@/server/queries/workload";
import type { ConsultantRequestStatus } from "@prisma/client";

export const metadata: Metadata = { title: NAV_LABELS.consultants };

export default async function ConsultantsPage() {
  const user = await requireUser();

  const requests = await prisma.consultantRequest.findMany({
    where: { apartment: apartmentScopeFor(user) },
    include: {
      apartment: {
        include: {
          building: true,
          project: { select: { id: true, name: true } },
        },
      },
      requestedBy: { select: { name: true } },
      assignee: { select: { name: true } },
      changeItem: { select: { code: true, description: true } },
      responses: {
        include: { responder: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const pending = requests.filter((request) => request.status === "PENDING");
  const answered = requests.filter((request) => request.status === "ANSWERED");
  const mine = requests.filter((request) => request.assigneeId === user.id);

  function renderList(items: typeof requests, emptyTitle: string, emptyDescription: string) {
    if (items.length === 0) {
      return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
      <div className="space-y-3">
        {items.map((request) => (
          <Card key={request.id}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    <span className="font-numeric">{request.code}</span>
                    <span className="text-ink-subtle" aria-hidden>
                      ·
                    </span>
                    <span>{CONSULTANT_KIND_LABELS[request.kind]}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    <Link
                      href={`/projects/${request.apartment.project.id}/apartments/${request.apartmentId}?tab=consultants`}
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      דירה {request.apartment.number}
                    </Link>{" "}
                    · {request.apartment.building.name} · {request.apartment.project.name}
                  </p>
                </div>
                <ConsultantRequestStatusBadge
                  status={request.status as ConsultantRequestStatus}
                />
              </div>

              <p className="mt-3 text-[13px] leading-6 text-ink-soft">{request.question}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-ink-subtle">
                <span>נשלח על ידי {request.requestedBy.name}</span>
                <span className="font-numeric">{formatDate(request.createdAt)}</span>
                {request.dueDate ? (
                  <span className="font-numeric">
                    יעד לתשובה: {formatDate(request.dueDate)}
                  </span>
                ) : null}
                <span>שויך ל{request.assignee?.name ?? "ללא שיוך"}</span>
              </div>

              {request.responses[0] ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <ConsultantDecisionBadge decision={request.responses[0].decision} />
                  <span className="text-[12px] text-ink-muted">
                    {request.responses[0].responder.name} ·{" "}
                    <span className="font-numeric">
                      {formatDate(request.responses[0].createdAt)}
                    </span>
                  </span>
                  {request.responses[0].conditions ? (
                    <span className="w-full text-[12px] leading-5 text-ink-soft">
                      {request.responses[0].conditions}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const tabs: UrlTab[] = [
    {
      key: "pending",
      label: "ממתין לתשובה",
      badge: pending.length,
      content: renderList(
        pending,
        "אין בקשות שממתינות לתשובת יועץ.",
        "בקשה שתישלח ליועץ תופיע כאן עד לקבלת תשובה.",
      ),
    },
    {
      key: "answered",
      label: "התקבלה תשובה",
      badge: answered.length,
      content: renderList(
        answered,
        "טרם התקבלו תשובות יועצים.",
        "תשובות יועצים יופיעו כאן עם ההחלטה והתנאים.",
      ),
    },
    {
      key: "mine",
      label: "משויך לי",
      badge: mine.length,
      content: renderList(
        mine,
        "אין בקשות שמשויכות אליך.",
        "בקשות שיישלחו אליך אישית יופיעו כאן.",
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={NAV_LABELS.consultants}
        description="כל הבקשות שהועברו ליועצים מקצועיים, והתשובות שהתקבלו."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="ממתין לתשובה" value={pending.length} tone="consultant" />
        <StatCard label="התקבלה תשובה" value={answered.length} tone="success" />
        <StatCard label="משויך לי" value={mine.length} />
      </div>

      <UrlTabs tabs={tabs} />
    </>
  );
}
