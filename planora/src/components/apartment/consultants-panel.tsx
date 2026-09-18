"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import {
  ConsultantDecisionBadge,
  ConsultantRequestStatusBadge,
} from "@/components/domain/status-badges";
import { CONSULTANT_KIND_LABELS } from "@/lib/i18n/he";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import {
  respondToConsultantRequest,
  simulateConsultantResponse,
} from "@/server/actions/consultants";
import type { ConsultantDecision, ConsultantKind, ConsultantRequestStatus } from "@prisma/client";
import type { WorkspacePermissions } from "./types";

export interface ConsultantRequestView {
  id: string;
  code: string;
  kind: ConsultantKind;
  status: ConsultantRequestStatus;
  question: string;
  dueDate: Date | null;
  createdAt: Date;
  requestedByName: string;
  assigneeName: string | null;
  changeCode: string | null;
  changeDescription: string | null;
  responses: {
    id: string;
    decision: ConsultantDecision;
    conditions: string | null;
    notes: string | null;
    responderName: string;
    createdAt: Date;
  }[];
}

const DECISION_OPTIONS: ConsultantDecision[] = [
  "APPROVED",
  "APPROVED_WITH_CONDITIONS",
  "REJECTED",
  "MORE_INFO_REQUIRED",
];

const DECISION_LABELS: Record<ConsultantDecision, string> = {
  APPROVED: "מאושר",
  APPROVED_WITH_CONDITIONS: "מאושר בתנאים",
  REJECTED: "נדחה",
  MORE_INFO_REQUIRED: "נדרש מידע נוסף",
};

export function ConsultantsPanel({
  requests,
  permissions,
}: {
  requests: ConsultantRequestView[];
  permissions: WorkspacePermissions;
}) {
  const [isPending, startTransition] = useTransition();
  const [respondingTo, setRespondingTo] = useState<ConsultantRequestView | null>(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setRespondingTo(null);
    });
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<UserCheck className="size-5" />}
        title="לא נשלחו בקשות ליועצים בדירה זו."
        description="שינוי שדורש חוות דעת מקצועית נשלח ליועץ מלשונית &rdquo;שינויים&ldquo;."
      />
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id}>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                  <span className="font-numeric">{request.code}</span>
                  <span className="text-ink-subtle" aria-hidden>
                    ·
                  </span>
                  <span>{CONSULTANT_KIND_LABELS[request.kind]}</span>
                </p>
                {request.changeDescription ? (
                  <p className="mt-1 text-[13px] text-ink-soft">
                    <span className="font-numeric text-ink-muted">{request.changeCode}</span>{" "}
                    {request.changeDescription}
                  </p>
                ) : null}
              </div>
              <ConsultantRequestStatusBadge status={request.status} />
            </div>

            <p className="mt-3 rounded-control bg-surface-muted px-3.5 py-2.5 text-[13px] leading-6 text-ink-soft">
              {request.question}
            </p>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px] text-ink-muted">
              <div className="flex gap-1.5">
                <dt>נשלח על ידי</dt>
                <dd className="font-medium text-ink-soft">{request.requestedByName}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>שויך ל</dt>
                <dd className="font-medium text-ink-soft">{request.assigneeName ?? "ללא שיוך"}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>תאריך שליחה</dt>
                <dd className="font-numeric font-medium text-ink-soft">
                  {formatDate(request.createdAt)}
                </dd>
              </div>
              {request.dueDate ? (
                <div className="flex gap-1.5">
                  <dt>יעד לתשובה</dt>
                  <dd className="font-numeric font-medium text-ink-soft">
                    {formatDate(request.dueDate)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {request.responses.length > 0 ? (
              <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                {request.responses.map((response) => (
                  <li
                    key={response.id}
                    className="rounded-card border border-line bg-surface-muted/50 px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ConsultantDecisionBadge decision={response.decision} />
                      <span className="font-numeric text-[11px] text-ink-subtle">
                        {response.responderName} · {formatDateTime(response.createdAt)}
                      </span>
                    </div>
                    {response.conditions ? (
                      <p className="mt-2 text-[12px] leading-5 text-ink-soft">
                        <span className="font-medium">תנאים: </span>
                        {response.conditions}
                      </p>
                    ) : null}
                    {response.notes ? (
                      <p className="mt-1 text-[12px] leading-5 text-ink-muted">{response.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {request.status === "PENDING" ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {permissions.canRespondAsConsultant ? (
                  <Button variant="consultant" size="sm" onClick={() => setRespondingTo(request)}>
                    מענה לבקשה
                  </Button>
                ) : null}
                {permissions.isDemoEnvironment && permissions.canSendToConsultant ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => simulateConsultantResponse(request.id))}
                  >
                    קבלת תשובת יועץ (הדגמה)
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {respondingTo ? (
        <RespondDialog
          request={respondingTo}
          isPending={isPending}
          onClose={() => setRespondingTo(null)}
          onSubmit={(values) =>
            run(() => respondToConsultantRequest({ requestId: respondingTo.id, ...values }))
          }
        />
      ) : null}
    </div>
  );
}

function RespondDialog({
  request,
  isPending,
  onClose,
  onSubmit,
}: {
  request: ConsultantRequestView;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    decision: ConsultantDecision;
    conditions?: string;
    notes?: string;
  }) => void;
}) {
  const [decision, setDecision] = useState<ConsultantDecision>("APPROVED");
  const [conditions, setConditions] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>מענה לבקשה {request.code}</DialogTitle>
          <DialogDescription>
            התשובה נשמרת כהחלטה מקצועית מתועדת, על שמך ועל תפקידך.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="response-decision">החלטה</Label>
            <Select
              id="response-decision"
              className="mt-1.5"
              value={decision}
              onChange={(event) => setDecision(event.target.value as ConsultantDecision)}
            >
              {DECISION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {DECISION_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          {decision === "APPROVED_WITH_CONDITIONS" ? (
            <div>
              <Label htmlFor="response-conditions">התנאים</Label>
              <Textarea
                id="response-conditions"
                className="mt-1.5"
                value={conditions}
                onChange={(event) => setConditions(event.target.value)}
                placeholder="למשל: בכפוף לשמירה על שיפוע ניקוז של 1.5%."
              />
            </div>
          ) : null}

          <div>
            <Label htmlFor="response-notes">הערות</Label>
            <Textarea
              id="response-notes"
              className="mt-1.5"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="consultant"
            disabled={
              isPending ||
              (decision === "APPROVED_WITH_CONDITIONS" && conditions.trim().length < 3)
            }
            onClick={() =>
              onSubmit({
                decision,
                conditions: conditions.trim() || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            שליחת התשובה
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
