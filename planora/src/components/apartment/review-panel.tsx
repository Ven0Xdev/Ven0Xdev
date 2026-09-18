"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, ClipboardCheck, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { ReviewStatusBadge } from "@/components/domain/status-badges";
import { formatDateTime } from "@/lib/i18n/format";
import {
  completeReviewAndMoveToPricing,
  returnPlanForCorrection,
} from "@/server/actions/review";
import type { ReviewStatus } from "@prisma/client";
import type { ChangeItemView, WorkspacePermissions } from "./types";

export interface ReviewView {
  id: string;
  status: ReviewStatus;
  summary: string | null;
  reviewerName: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  comments: {
    id: string;
    authorName: string;
    body: string;
    createdAt: Date;
    isCorrectionRequest: boolean;
  }[];
}

export function ReviewPanel({
  apartmentId,
  reviews,
  changes,
  permissions,
}: {
  apartmentId: string;
  reviews: ReviewView[];
  changes: ChangeItemView[];
  permissions: WorkspacePermissions;
}) {
  const [isPending, startTransition] = useTransition();
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [note, setNote] = useState("");

  const pending = changes.filter((change) => change.status === "DETECTED");
  const awaiting = changes.filter((change) => change.status === "AWAITING_CONSULTANT");
  const decided = changes.length - pending.length - awaiting.length;
  const progress = changes.length > 0 ? Math.round((decided / changes.length) * 100) : 0;

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setIsCorrectionOpen(false);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>התקדמות הבדיקה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-3">
              <p className="font-numeric text-3xl leading-9 font-semibold text-ink">
                {decided}
                <span className="text-lg text-ink-subtle"> / {changes.length}</span>
              </p>
              <p className="font-numeric text-[13px] text-ink-muted">{progress}%</p>
            </div>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-sunken"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="התקדמות הבדיקה"
            >
              <div className="h-full bg-brand-600" style={{ width: `${progress}%` }} />
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-[11px] text-ink-subtle">ממתין לבדיקה</dt>
                <dd className="font-numeric mt-0.5 text-lg font-semibold text-warning-700">
                  {pending.length}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-subtle">ממתין ליועץ</dt>
                <dd className="font-numeric mt-0.5 text-lg font-semibold text-consultant-700">
                  {awaiting.length}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-subtle">הוכרעו</dt>
                <dd className="font-numeric mt-0.5 text-lg font-semibold text-success-700">
                  {decided}
                </dd>
              </div>
            </dl>

            {permissions.canDecide ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                <Button
                  variant="primary"
                  disabled={isPending}
                  onClick={() => run(() => completeReviewAndMoveToPricing(apartmentId))}
                >
                  <ClipboardCheck />
                  אשר בדיקה והעבר לתמחור
                </Button>
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => setIsCorrectionOpen(true)}
                >
                  <RotateCcw />
                  החזר לתיקון
                </Button>
              </div>
            ) : (
              <p className="mt-4 border-t border-line pt-4 text-[12px] text-ink-muted">
                רק מנהלת שינויי דיירים או מנהל פרויקט יכולים לסיים את הבדיקה.
              </p>
            )}
          </CardContent>
        </Card>

        {pending.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>שינויים שממתינים להכרעה</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-line">
                {pending.map((change) => (
                  <li key={change.id} className="flex items-center gap-3 py-2.5">
                    <span className="font-numeric shrink-0 text-[12px] text-ink-subtle">
                      {change.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                      {change.description}
                    </span>
                    {change.roomLabel ? (
                      <span className="shrink-0 text-[12px] text-ink-muted">
                        {change.roomLabel}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-muted">
                <ArrowLeftRight className="size-3.5" aria-hidden />
                ההכרעה בכל שינוי נעשית בלשונית &rdquo;שינויים&ldquo;.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>יומן הבדיקה</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {reviews.length === 0 ? (
            <p className="py-6 text-[13px] text-ink-muted">טרם נפתחה בדיקה לדירה זו.</p>
          ) : (
            <ul className="space-y-4">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-card border border-line px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink">
                      {review.reviewerName ?? "ללא אחראי"}
                    </p>
                    <ReviewStatusBadge status={review.status} />
                  </div>
                  {review.summary ? (
                    <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">{review.summary}</p>
                  ) : null}
                  <p className="font-numeric mt-1.5 text-[11px] text-ink-subtle">
                    {review.startedAt ? formatDateTime(review.startedAt) : "—"}
                    {review.completedAt ? ` → ${formatDateTime(review.completedAt)}` : ""}
                  </p>

                  {review.comments.length > 0 ? (
                    <ul className="mt-3 space-y-2 border-t border-line pt-3">
                      {review.comments.map((comment) => (
                        <li key={comment.id}>
                          <p className="text-[12px] leading-5 text-ink-soft">
                            {comment.isCorrectionRequest ? (
                              <span className="me-1.5 font-medium text-danger-600">
                                בקשת תיקון:
                              </span>
                            ) : null}
                            {comment.body}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ink-subtle">
                            {comment.authorName} · {formatDateTime(comment.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCorrectionOpen} onOpenChange={setIsCorrectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>החזרת התוכנית לתיקון</DialogTitle>
            <DialogDescription>
              יש לפרט מה נדרש לתקן. ההודעה תישמר ביומן הבדיקה ותועבר למי שהכין את התוכנית.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-28"
              placeholder="למשל: חסרות מידות למחיצת הגבס בסלון ולא סומנה נקודת המים במטבח."
              aria-label="פירוט התיקון הנדרש"
            />
          </DialogBody>
          <DialogFooter>
            <Button
              variant="primary"
              disabled={isPending || note.trim().length < 3}
              onClick={() => run(() => returnPlanForCorrection(apartmentId, note))}
            >
              החזר לתיקון
            </Button>
            <Button variant="ghost" onClick={() => setIsCorrectionOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
