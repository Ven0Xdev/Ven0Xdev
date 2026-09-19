"use client";

import { useState } from "react";
import { MessageSquarePlus, PlusCircle } from "lucide-react";
import type {
  ChangeCategoryKey,
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
import { ChangeRequestDialog, ExceptionRequestDialog } from "./request-dialogs";

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

export function TenantRequests({
  changeRequests,
  exceptionRequests,
}: {
  changeRequests: ChangeRequestView[];
  exceptionRequests: ExceptionRequestView[];
}) {
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isExceptionOpen, setIsExceptionOpen] = useState(false);

  const isEmpty = changeRequests.length === 0 && exceptionRequests.length === 0;

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
          title="עדיין לא שלחת בקשות."
          description="אפשר לבקש שינוי בתוכנית הדירה, או אפשרות שאינה מופיעה בקטלוג."
        />
      ) : (
        <div className="space-y-6">
          {changeRequests.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[14px] font-semibold text-ink">בקשות שינוי</h2>
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
