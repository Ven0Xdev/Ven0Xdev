"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Unlock, X } from "lucide-react";
import type {
  ChangeCategoryKey,
  ChangeRequestStatus,
  ConfigurationStatus,
  ExceptionRequestStatus,
  SelectionStatus,
  SupplierCategory,
} from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Select, Textarea } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/i18n/format";
import {
  CHANGE_CATEGORY_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_TONE,
  CONFIGURATION_STATUS_LABELS,
  CONFIGURATION_STATUS_TONE,
  EXCEPTION_REQUEST_STATUS_LABELS,
  EXCEPTION_REQUEST_STATUS_TONE,
  SELECTION_STATUS_LABELS,
  SELECTION_STATUS_TONE,
  TENANT_CATEGORY_LABELS,
} from "@/lib/i18n/he";
import {
  decideChangeRequest,
  decideExceptionRequest,
  decideSelection,
  unlockConfiguration,
} from "@/server/actions/selection-review";

/** הסטטוסים שמותר להגדיר ידנית בטיפול בבקשה */
type ChangeRequestDecision =
  | "UNDER_REVIEW"
  | "REQUIRES_CONSULTANT"
  | "PRICED"
  | "APPROVED"
  | "REJECTED";

type ExceptionDecision =
  | "UNDER_REVIEW"
  | "SENT_TO_SUPPLIER"
  | "MORE_INFO_REQUIRED"
  | "APPROVED"
  | "REJECTED";

export interface SelectionRow {
  id: string;
  productName: string;
  supplierName: string;
  variantName: string | null;
  category: SupplierCategory;
  price: number;
  quantity: number;
  status: SelectionStatus;
  requiresApproval: boolean;
  requiresConsultant: boolean;
  isMajorChange: boolean;
  selectedAt: Date;
}

export interface ChangeRequestRow {
  id: string;
  code: string;
  title: string;
  description: string;
  category: ChangeCategoryKey;
  status: ChangeRequestStatus;
  createdAt: Date;
  estimatedPrice: number | null;
}

export interface ExceptionRow {
  id: string;
  code: string;
  title: string;
  description: string;
  category: SupplierCategory;
  status: ExceptionRequestStatus;
  createdAt: Date;
  referenceUrl: string | null;
}

export function SelectionsPanel({
  apartmentId,
  configurationStatus,
  configurationLabel,
  selections,
  changeRequests,
  exceptionRequests,
  canDecide,
  canHandleRequests,
}: {
  apartmentId: string;
  configurationStatus: ConfigurationStatus | null;
  configurationLabel: string | null;
  selections: SelectionRow[];
  changeRequests: ChangeRequestRow[];
  exceptionRequests: ExceptionRow[];
  canDecide: boolean;
  canHandleRequests: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  const isEmpty =
    selections.length === 0 && changeRequests.length === 0 && exceptionRequests.length === 0;

  if (isEmpty) {
    return (
      <EmptyState
        title="הדייר טרם שלח בחירות או בקשות."
        description="בחירות מוצרים ובקשות שינוי מהאזור האישי של הדייר יופיעו כאן."
      />
    );
  }

  return (
    <div className="space-y-6">
      {selections.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>בחירות הדייר</CardTitle>
              <div className="flex items-center gap-2">
                {configurationStatus ? (
                  <Badge tone={CONFIGURATION_STATUS_TONE[configurationStatus]}>
                    {configurationLabel} · {CONFIGURATION_STATUS_LABELS[configurationStatus]}
                  </Badge>
                ) : null}
                {canDecide && configurationStatus && configurationStatus !== "DRAFT" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => unlockConfiguration(apartmentId))}
                  >
                    <Unlock />
                    פתח לעריכה
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-line">
              {selections.map((selection) => (
                <li key={selection.id} className="py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">
                        {selection.productName}
                        {selection.variantName ? (
                          <span className="text-ink-muted"> · {selection.variantName}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {TENANT_CATEGORY_LABELS[selection.category]} · {selection.supplierName} ·{" "}
                        <span className="font-numeric">{formatDate(selection.selectedAt)}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={SELECTION_STATUS_TONE[selection.status]} size="sm">
                          {SELECTION_STATUS_LABELS[selection.status]}
                        </Badge>
                        {selection.requiresConsultant ? (
                          <Badge tone="consultant" size="sm">
                            דורש יועץ
                          </Badge>
                        ) : null}
                        {selection.requiresApproval ? (
                          <Badge tone="warning" size="sm">
                            דורש אישור
                          </Badge>
                        ) : null}
                        {selection.isMajorChange ? (
                          <Badge tone="brand" size="sm">
                            שינוי משמעותי
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-numeric text-[14px] font-semibold text-ink">
                        {selection.price > 0
                          ? formatCurrency(selection.price * selection.quantity, { decimals: false })
                          : "כלול"}
                      </span>

                      {canDecide &&
                      ["REQUESTED", "UNDER_REVIEW"].includes(selection.status) ? (
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              run(() =>
                                decideSelection({
                                  selectionId: selection.id,
                                  decision: "APPROVED",
                                }),
                              )
                            }
                          >
                            <Check />
                            אשר
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              run(() =>
                                decideSelection({
                                  selectionId: selection.id,
                                  decision: "REJECTED",
                                }),
                              )
                            }
                          >
                            <X />
                            דחה
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {changeRequests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>בקשות שינוי מהדייר</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {changeRequests.map((request) => (
                <RequestRow
                  key={request.id}
                  title={request.title}
                  meta={`${request.code} · ${CHANGE_CATEGORY_LABELS[request.category]} · ${formatDate(request.createdAt)}`}
                  description={request.description}
                  badge={
                    <Badge tone={CHANGE_REQUEST_STATUS_TONE[request.status]}>
                      {CHANGE_REQUEST_STATUS_LABELS[request.status]}
                    </Badge>
                  }
                  extra={
                    request.estimatedPrice !== null
                      ? `מחיר משוער: ${formatCurrency(request.estimatedPrice)}`
                      : null
                  }
                  canHandle={canHandleRequests}
                  statusOptions={[
                    ["UNDER_REVIEW", "בבדיקה"],
                    ["REQUIRES_CONSULTANT", "ממתינה ליועץ"],
                    ["PRICED", "תומחרה"],
                    ["APPROVED", "אושרה"],
                    ["REJECTED", "נדחתה"],
                  ]}
                  onSubmit={(status, notes) =>
                    run(() =>
                      decideChangeRequest({
                        requestId: request.id,
                        status: status as ChangeRequestDecision,
                        notes,
                      }),
                    )
                  }
                  isPending={isPending}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {exceptionRequests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>בקשות לאפשרות חריגה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {exceptionRequests.map((request) => (
                <RequestRow
                  key={request.id}
                  title={request.title}
                  meta={`${request.code} · ${TENANT_CATEGORY_LABELS[request.category]} · ${formatDate(request.createdAt)}`}
                  description={request.description}
                  badge={
                    <Badge tone={EXCEPTION_REQUEST_STATUS_TONE[request.status]}>
                      {EXCEPTION_REQUEST_STATUS_LABELS[request.status]}
                    </Badge>
                  }
                  extra={request.referenceUrl}
                  canHandle={canHandleRequests}
                  statusOptions={[
                    ["UNDER_REVIEW", "בבדיקה"],
                    ["SENT_TO_SUPPLIER", "הועברה לספק"],
                    ["MORE_INFO_REQUIRED", "נדרש מידע נוסף"],
                    ["APPROVED", "אושרה באופן חריג"],
                    ["REJECTED", "נדחתה"],
                  ]}
                  onSubmit={(status, notes) =>
                    run(() =>
                      decideExceptionRequest({
                        requestId: request.id,
                        status: status as ExceptionDecision,
                        notes,
                      }),
                    )
                  }
                  isPending={isPending}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-[12px] leading-5 text-ink-muted">
        אישור חריג אינו מוסיף את המוצר לקטלוג. הוספת מוצר לפרויקט נעשית בנפרד, במסך
        הספקים והקטלוגים.
      </p>
    </div>
  );
}

function RequestRow({
  title,
  meta,
  description,
  badge,
  extra,
  canHandle,
  statusOptions,
  onSubmit,
  isPending,
}: {
  title: string;
  meta: string;
  description: string;
  badge: React.ReactNode;
  extra: string | null;
  canHandle: boolean;
  statusOptions: [string, string][];
  onSubmit: (status: string, notes?: string) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState(statusOptions[0][0]);
  const [notes, setNotes] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-card border border-line px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          <p className="font-numeric mt-0.5 text-[11px] text-ink-subtle">{meta}</p>
        </div>
        {badge}
      </div>

      <p className="mt-2.5 text-[13px] leading-6 text-ink-soft">{description}</p>
      {extra ? <p className="mt-1.5 text-[12px] text-ink-muted">{extra}</p> : null}

      {canHandle ? (
        isOpen ? (
          <div className="mt-3 space-y-2.5 border-t border-line pt-3">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="סטטוס הבקשה"
            >
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="הודעה לדייר (לא חובה)"
              aria-label="הודעה לדייר"
              className="min-h-20"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  onSubmit(status, notes.trim() || undefined);
                  setIsOpen(false);
                  setNotes("");
                }}
              >
                עדכון הבקשה
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setIsOpen(true)}>
            טיפול בבקשה
          </Button>
        )
      ) : null}
    </div>
  );
}
