"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Check,
  CircleSlash,
  Info,
  Lock,
  MessageSquarePlus,
  PencilLine,
  Send,
  ShieldAlert,
} from "lucide-react";

import type { ChangeCategoryKey, ChangeType, ConsultantKind } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  ChangeItemStatusBadge,
  ChangeTypeBadge,
  ConfidenceBadge,
} from "@/components/domain/status-badges";
import { confidencePercent } from "@/lib/changes/confidence";
import {
  CHANGE_CATEGORY_LABELS,
  CHANGE_TYPE_LABELS,
  CONSULTANT_DECISION_LABELS,
  CONSULTANT_KIND_LABELS,
  CONSULTANT_REQUEST_STATUS_LABELS,
} from "@/lib/i18n/he";
import { formatDateTime, formatQuantity } from "@/lib/i18n/format";
import {
  addChangeNote,
  confirmChangeItem,
  correctChangeItem,
  dismissChangeItem,
  rejectChangeItem,
  sendChangeToConsultant,
} from "@/server/actions/changes";
import { simulateConsultantResponse } from "@/server/actions/consultants";
import type { ChangeItemView, ConsultantOption, WorkspacePermissions } from "./types";

const CHANGE_TYPE_OPTIONS: ChangeType[] = ["ADDED", "REMOVED", "MOVED", "MODIFIED", "UNKNOWN"];
const CATEGORY_OPTIONS: ChangeCategoryKey[] = [
  "ELECTRICAL",
  "LIGHTING",
  "WALL",
  "DOOR",
  "WINDOW",
  "PLUMBING",
  "HVAC",
  "KITCHEN",
  "SANITARY",
  "COMMUNICATION",
  "OTHER",
];
const CONSULTANT_KIND_OPTIONS: ConsultantKind[] = [
  "PLUMBING",
  "HVAC",
  "ELECTRICAL",
  "STRUCTURAL",
  "ARCHITECT",
  "OTHER",
];

export function ChangeDetail({
  change,
  permissions,
  consultants,
}: {
  change: ChangeItemView;
  permissions: WorkspacePermissions;
  consultants: ConsultantOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [openDialog, setOpenDialog] = useState<
    null | "correct" | "consultant" | "note" | "reject" | "dismiss"
  >(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setOpenDialog(null);
    });
  }

  const isOpenForDecision = change.status === "DETECTED";
  const isAwaitingConsultant = change.status === "AWAITING_CONSULTANT";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] leading-6 font-semibold text-ink">{change.description}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
              <span className="font-numeric">{change.code}</span>
              {change.roomLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{change.roomLabel}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <span>{CHANGE_CATEGORY_LABELS[change.categoryKey]}</span>
            </p>
          </div>
          <ChangeTypeBadge type={change.type} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ChangeItemStatusBadge status={change.status} />
          <ConfidenceBadge confidence={change.confidence} />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="כמות" value={formatQuantity(change.quantity, change.unit)} numeric />
          <Field label="רמת ודאות בזיהוי" value={confidencePercent(change.confidence)} numeric />
          {change.decidedByName ? (
            <Field label="הוכרע על ידי" value={change.decidedByName} />
          ) : null}
          {change.decidedAt ? (
            <Field label="תאריך הכרעה" value={formatDateTime(change.decidedAt)} numeric />
          ) : null}
        </dl>

        <p className="flex items-start gap-1.5 rounded-control bg-surface-sunken px-3 py-2 text-[12px] leading-5 text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          רמת ודאות בזיהוי אינה אישור מקצועי. ההחלטה על השינוי היא של גורם מקצועי מורשה.
        </p>

        {change.ruleHits.length > 0 ? (
          <section>
            <h4 className="mb-2 text-[12px] font-semibold text-ink-soft">כללים שנדלקו</h4>
            <ul className="space-y-1.5">
              {change.ruleHits.map((hit) => (
                <li
                  key={hit.ruleKey}
                  className="flex items-start gap-2 rounded-control border border-line bg-surface-muted/60 px-3 py-2"
                >
                  {hit.severity === "BLOCKING" ? (
                    <Lock className="mt-0.5 size-3.5 shrink-0 text-danger-600" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-600" aria-hidden />
                  )}
                  <span className="text-[12px] leading-5 text-ink-soft">{hit.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {change.blockedFromAutomation ? (
          <p className="flex items-start gap-2 rounded-control border border-danger-100 bg-danger-50 px-3 py-2.5 text-[12px] leading-5 text-danger-700">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            שינוי זה חוסם המשך אוטומטי של התהליך. לא ניתן להעביר את הדירה לתמחור ללא אישור
            גורם מקצועי מורשה.
          </p>
        ) : null}

        {change.consultantRequest ? (
          <section className="rounded-card border border-consultant-100 bg-consultant-50/50 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-consultant-700">
                בקשת יועץ {change.consultantRequest.code}
              </p>
              <Badge tone="consultant" size="sm">
                {
                  CONSULTANT_REQUEST_STATUS_LABELS[
                    change.consultantRequest.status as keyof typeof CONSULTANT_REQUEST_STATUS_LABELS
                  ]
                }
              </Badge>
            </div>
            {change.consultantRequest.decision ? (
              <p className="mt-2 text-[12px] leading-5 text-ink-soft">
                <span className="font-medium">
                  {
                    CONSULTANT_DECISION_LABELS[
                      change.consultantRequest.decision as keyof typeof CONSULTANT_DECISION_LABELS
                    ]
                  }
                </span>
                {change.consultantRequest.conditions ? ` — ${change.consultantRequest.conditions}` : null}
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-ink-muted">ממתין לתשובת היועץ.</p>
            )}

            {isAwaitingConsultant && permissions.isDemoEnvironment && permissions.canSendToConsultant ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2.5"
                disabled={isPending}
                onClick={() => run(() => simulateConsultantResponse(change.consultantRequest!.id))}
              >
                קבלת תשובת יועץ (הדגמה)
              </Button>
            ) : null}
          </section>
        ) : null}

        {change.notes ? (
          <section>
            <h4 className="mb-1.5 text-[12px] font-semibold text-ink-soft">הערת הכרעה</h4>
            <p className="text-[12px] leading-5 text-ink-muted">{change.notes}</p>
          </section>
        ) : null}

        {change.comments.length > 0 ? (
          <section>
            <h4 className="mb-2 text-[12px] font-semibold text-ink-soft">הערות</h4>
            <ul className="space-y-2">
              {change.comments.map((comment) => (
                <li key={comment.id} className="rounded-control border border-line px-3 py-2">
                  <p className="text-[12px] leading-5 text-ink-soft">{comment.body}</p>
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {comment.authorName} · {formatDateTime(comment.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* פעולות — Human in the loop */}
      <div className="border-t border-line bg-surface-muted/60 px-4 py-3">
        {!permissions.canDecide && !permissions.canComment ? (
          <p className="text-[12px] text-ink-muted">אין לך הרשאה להכריע בשינויים בדירה זו.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {permissions.canDecide && isOpenForDecision ? (
              <Button
                variant="success"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => confirmChangeItem(change.id))}
              >
                <Check />
                אשר זיהוי
              </Button>
            ) : null}

            {permissions.canDecide ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => setOpenDialog("correct")}
              >
                <PencilLine />
                תקן זיהוי
              </Button>
            ) : null}

            {permissions.canSendToConsultant && !change.consultantRequest ? (
              <Button
                variant="consultant"
                size="sm"
                disabled={isPending}
                onClick={() => setOpenDialog("consultant")}
              >
                <Send />
                שלח ליועץ
              </Button>
            ) : null}

            {permissions.canDecide && isOpenForDecision ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setOpenDialog("dismiss")}
              >
                <CircleSlash />
                לא מדובר בשינוי
              </Button>
            ) : null}

            {permissions.canDecide && isOpenForDecision ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setOpenDialog("reject")}
              >
                <Ban />
                דחה
              </Button>
            ) : null}

            {permissions.canComment ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => setOpenDialog("note")}
              >
                <MessageSquarePlus />
                הוסף הערה
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <CorrectDialog
        change={change}
        open={openDialog === "correct"}
        onOpenChange={(open) => setOpenDialog(open ? "correct" : null)}
        isPending={isPending}
        onSubmit={(values) => run(() => correctChangeItem({ changeItemId: change.id, ...values }))}
      />

      <ConsultantDialog
        change={change}
        consultants={consultants}
        open={openDialog === "consultant"}
        onOpenChange={(open) => setOpenDialog(open ? "consultant" : null)}
        isPending={isPending}
        onSubmit={(values) =>
          run(() => sendChangeToConsultant({ changeItemId: change.id, ...values }))
        }
      />

      <NoteDialog
        title="הוספת הערה"
        description="ההערה תישמר ביומן הבדיקה של הדירה."
        confirmLabel="הוסף הערה"
        open={openDialog === "note"}
        onOpenChange={(open) => setOpenDialog(open ? "note" : null)}
        isPending={isPending}
        onSubmit={(body) => run(() => addChangeNote(change.id, body))}
      />

      <NoteDialog
        title="סימון שאין מדובר בשינוי"
        description="הפעולה מסמנת שהמערכת זיהתה הבדל בטעות. ניתן להוסיף הסבר קצר."
        confirmLabel="סמן כזיהוי שגוי"
        optional
        open={openDialog === "dismiss"}
        onOpenChange={(open) => setOpenDialog(open ? "dismiss" : null)}
        isPending={isPending}
        onSubmit={(body) => run(() => dismissChangeItem(change.id, body || undefined))}
      />

      <NoteDialog
        title="דחיית השינוי"
        description="השינוי זוהה נכון אך לא יבוצע. יש לציין את הסיבה."
        confirmLabel="דחה שינוי"
        open={openDialog === "reject"}
        onOpenChange={(open) => setOpenDialog(open ? "reject" : null)}
        isPending={isPending}
        onSubmit={(body) => run(() => rejectChangeItem(change.id, body))}
      />
    </div>
  );
}

function Field({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-ink-subtle">{label}</dt>
      <dd className={`mt-0.5 text-[13px] text-ink ${numeric ? "font-numeric" : ""}`}>{value}</dd>
    </div>
  );
}

function CorrectDialog({
  change,
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  change: ChangeItemView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (values: { type: ChangeType; categoryKey: ChangeCategoryKey; notes?: string }) => void;
}) {
  const [type, setType] = useState<ChangeType>(change.type);
  const [categoryKey, setCategoryKey] = useState<ChangeCategoryKey>(change.categoryKey);
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>תיקון זיהוי</DialogTitle>
          <DialogDescription>
            התיקון נשמר כהחלטה מקצועית וגם כרשומת למידה. אין אימון אוטומטי בזמן אמת.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="correct-type">סוג השינוי</Label>
            <Select
              id="correct-type"
              className="mt-1.5"
              value={type}
              onChange={(event) => setType(event.target.value as ChangeType)}
            >
              {CHANGE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {CHANGE_TYPE_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="correct-category">קטגוריה</Label>
            <Select
              id="correct-category"
              className="mt-1.5"
              value={categoryKey}
              onChange={(event) => setCategoryKey(event.target.value as ChangeCategoryKey)}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {CHANGE_CATEGORY_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="correct-notes">הערה (לא חובה)</Label>
            <Textarea
              id="correct-notes"
              className="mt-1.5"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="למשל: הסימון בקובץ המקור היה בשכבה שגויה."
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending}
            onClick={() => onSubmit({ type, categoryKey, notes: notes.trim() || undefined })}
          >
            שמירת התיקון
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsultantDialog({
  change,
  consultants,
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  change: ChangeItemView;
  consultants: ConsultantOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (values: {
    kind: ConsultantKind;
    question: string;
    assigneeId?: string;
    dueDate?: string;
  }) => void;
}) {
  const [kind, setKind] = useState<ConsultantKind>(change.consultantKind ?? "PLUMBING");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [question, setQuestion] = useState(
    `${change.description}${change.roomLabel ? ` (${change.roomLabel})` : ""}. נא לאשר את ההיתכנות.`,
  );

  const matching = consultants.filter((consultant) => consultant.kind === kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>שליחת השינוי ליועץ</DialogTitle>
          <DialogDescription>
            היועץ יקבל את הדירה, הגרסה, השינוי המסומן והשאלה שלך.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="consultant-kind">סוג היועץ</Label>
            <Select
              id="consultant-kind"
              className="mt-1.5"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as ConsultantKind);
                setAssigneeId("");
              }}
            >
              {CONSULTANT_KIND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {CONSULTANT_KIND_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="consultant-assignee">שיוך ליועץ</Label>
            <Select
              id="consultant-assignee"
              className="mt-1.5"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">ללא שיוך אישי</option>
              {matching.map((consultant) => (
                <option key={consultant.id} value={consultant.id}>
                  {consultant.name} — {consultant.role}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="consultant-due">תאריך יעד לתשובה</Label>
            <Input
              id="consultant-due"
              type="date"
              className="mt-1.5"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="consultant-question">השאלה ליועץ</Label>
            <Textarea
              id="consultant-question"
              className="mt-1.5 min-h-24"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="consultant"
            disabled={isPending || question.trim().length < 5}
            onClick={() =>
              onSubmit({
                kind,
                question,
                assigneeId: assigneeId || undefined,
                dueDate: dueDate || undefined,
              })
            }
          >
            שלח ליועץ
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  title,
  description,
  confirmLabel,
  optional,
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  optional?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-24"
            aria-label={title}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending || (!optional && body.trim().length < 3)}
            onClick={() => onSubmit(body.trim())}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
