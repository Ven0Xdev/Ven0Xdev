"use client";

import { useState } from "react";
import { MessageSquarePlus, PlusCircle } from "lucide-react";
import type {
  ChangeCategoryKey,
  ChangeItemStatus,
  ChangeRequestStatus,
  ExceptionRequestStatus,
  SupplierCategory,
} from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatCurrency, formatDate } from "@/lib/i18n/format";
import {
  CHANGE_CATEGORY_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_TONE,
  EXCEPTION_REQUEST_STATUS_LABELS,
  EXCEPTION_REQUEST_STATUS_TONE,
  TENANT_CATEGORY_LABELS,
} from "@/lib/i18n/he";
import type { StatusTone } from "@/lib/i18n/he";
import { ChangeRequestDialog, ExceptionRequestDialog } from "./request-dialogs";

/** ניסוח הסטטוס כפי שהדייר רואה אותו — ללא מונחים פנימיים */
const TENANT_CHANGE_STATUS: Record<ChangeItemStatus, { label: string; tone: StatusTone }> = {
  DETECTED: { label: "בבדיקה מקצועית", tone: "warning" },
  CONFIRMED: { label: "אושר", tone: "success" },
  DISMISSED: { label: "לא רלוונטי", tone: "neutral" },
  REJECTED: { label: "לא אושר", tone: "danger" },
  AWAITING_CONSULTANT: { label: "ממתין ליועץ", tone: "consultant" },
  CONSULTANT_APPROVED: { label: "אושר", tone: "success" },
  CONSULTANT_CONDITIONAL: { label: "אושר בתנאים", tone: "warning" },
  CONSULTANT_REJECTED: { label: "לא אושר", tone: "danger" },
  PRICED: { label: "תומחר", tone: "brand" },
};

interface PlanChange {
  id: string;
  description: string;
  categoryKey: ChangeCategoryKey;
  roomLabel: string | null;
  status: ChangeItemStatus;
  price: number;
  notes: string | null;
}

interface ChangeRequestView {
  id: string;
  code: string;
  title: string;
  description: string;
  category: ChangeCategoryKey;
  status: ChangeRequestStatus;
  createdAt: Date;
  decisionNotes: string | null;
  estimatedPrice: number | null;
}

interface ExceptionRequestView {
  id: string;
  code: string;
  title: string;
  description: string;
  category: SupplierCategory;
  status: ExceptionRequestStatus;
  createdAt: Date;
  decisionNotes: string | null;
}

export function TenantChanges({
  planChanges,
  changeRequests,
  exceptionRequests,
}: {
  planChanges: PlanChange[];
  changeRequests: ChangeRequestView[];
  exceptionRequests: ExceptionRequestView[];
}) {
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isExceptionOpen, setIsExceptionOpen] = useState(false);

  const isEmpty =
    planChanges.length === 0 && changeRequests.length === 0 && exceptionRequests.length === 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setIsChangeOpen(true)}>
          <MessageSquarePlus />
          בקש שינוי
        </Button>
        <Button variant="secondary" onClick={() => setIsExceptionOpen(true)}>
          <PlusCircle />
          בקש אפשרות אחרת
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          title="עדיין אין שינויים בדירה שלך."
          description="אפשר לבקש שינוי בתוכנית, או לבחור שדרוגים מתוך האפשרויות שמתאימות לדירה."
        />
      ) : (
        <div className="space-y-7">
          {planChanges.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[14px] font-semibold text-ink">שינויים בתוכנית הדירה</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {planChanges.map((change) => {
                  const status = TENANT_CHANGE_STATUS[change.status];
                  return (
                    <Card key={change.id}>
                      <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-ink">
                              {change.description}
                            </p>
                            <p className="mt-0.5 text-[12px] text-ink-muted">
                              {CHANGE_CATEGORY_LABELS[change.categoryKey]}
                              {change.roomLabel ? ` · ${change.roomLabel}` : ""}
                            </p>
                          </div>
                          <Badge tone={status.tone} size="sm">
                            {status.label}
                          </Badge>
                        </div>

                        {change.price > 0 ? (
                          <p className="font-numeric mt-3 border-t border-line pt-2.5 text-[13px] font-medium text-ink">
                            {formatCurrency(change.price)}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          {changeRequests.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[14px] font-semibold text-ink">הבקשות שלי</h2>
              <div className="space-y-3">
                {changeRequests.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-ink">{request.title}</p>
                          <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">
                            {request.code} · {CHANGE_CATEGORY_LABELS[request.category]} ·{" "}
                            {formatDate(request.createdAt)}
                          </p>
                        </div>
                        <Badge tone={CHANGE_REQUEST_STATUS_TONE[request.status]}>
                          {CHANGE_REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </div>

                      <p className="mt-3 text-[13px] leading-6 text-ink-soft">
                        {request.description}
                      </p>

                      {request.estimatedPrice !== null ? (
                        <p className="mt-3 border-t border-line pt-3 text-[13px]">
                          <span className="text-ink-muted">מחיר משוער: </span>
                          <span className="font-numeric font-medium text-ink">
                            {formatCurrency(request.estimatedPrice)}
                          </span>
                        </p>
                      ) : null}

                      {request.decisionNotes ? (
                        <p className="mt-2 rounded-control bg-surface-muted px-3 py-2 text-[12px] leading-5 text-ink-soft">
                          {request.decisionNotes}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {exceptionRequests.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[14px] font-semibold text-ink">בקשות לאפשרות אחרת</h2>
              <div className="space-y-3">
                {exceptionRequests.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-ink">{request.title}</p>
                          <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">
                            {request.code} · {TENANT_CATEGORY_LABELS[request.category]} ·{" "}
                            {formatDate(request.createdAt)}
                          </p>
                        </div>
                        <Badge tone={EXCEPTION_REQUEST_STATUS_TONE[request.status]}>
                          {EXCEPTION_REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                      </div>

                      <p className="mt-3 text-[13px] leading-6 text-ink-soft">
                        {request.description}
                      </p>

                      {request.decisionNotes ? (
                        <p className="mt-2 rounded-control bg-surface-muted px-3 py-2 text-[12px] leading-5 text-ink-soft">
                          {request.decisionNotes}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <ChangeRequestDialog open={isChangeOpen} onOpenChange={setIsChangeOpen} />
      <ExceptionRequestDialog open={isExceptionOpen} onOpenChange={setIsExceptionOpen} />
    </>
  );
}
