import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApprovalStatusBadge } from "@/components/domain/status-badges";
import { EmptyState } from "@/components/ui/misc";
import { APPROVAL_KIND_LABELS, PROFESSIONAL_DECISION_KIND_LABELS, USER_ROLE_LABELS } from "@/lib/i18n/he";
import { formatDateTime } from "@/lib/i18n/format";
import type { ApprovalKind, ApprovalStatus, ProfessionalDecisionKind, UserRole } from "@prisma/client";
import { ReleaseForExecutionButton } from "./release-button";

export interface ApprovalView {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  grantedByName: string | null;
  grantedAt: Date | null;
  notes: string | null;
}

export interface DecisionView {
  id: string;
  kind: ProfessionalDecisionKind;
  decision: string;
  notes: string | null;
  userName: string;
  role: UserRole;
  createdAt: Date;
}

export function ApprovalsPanel({
  apartmentId,
  approvals,
  decisions,
  canRelease,
  isPaid,
}: {
  apartmentId: string;
  approvals: ApprovalView[];
  decisions: DecisionView[];
  canRelease: boolean;
  isPaid: boolean;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>שרשרת האישורים</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {approvals.length === 0 ? (
            <p className="py-6 text-[13px] text-ink-muted">טרם נפתחו אישורים לדירה זו.</p>
          ) : (
            <ul className="divide-y divide-line">
              {approvals.map((approval) => (
                <li key={approval.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">
                      {APPROVAL_KIND_LABELS[approval.kind]}
                    </p>
                    {approval.grantedByName && approval.grantedAt ? (
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {approval.grantedByName} ·{" "}
                        <span className="font-numeric">{formatDateTime(approval.grantedAt)}</span>
                      </p>
                    ) : null}
                  </div>
                  <ApprovalStatusBadge status={approval.status} />
                </li>
              ))}
            </ul>
          )}

          {canRelease ? (
            <div className="mt-4 border-t border-line pt-4">
              <ReleaseForExecutionButton apartmentId={apartmentId} disabled={!isPaid} />
              {!isPaid ? (
                <p className="mt-2 text-[12px] leading-5 text-ink-muted">
                  שחרור לביצוע מתאפשר רק לאחר שהתקבל תשלום מהדייר.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>החלטות מקצועיות</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {decisions.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-5" />}
              title="טרם נרשמו החלטות מקצועיות."
              description="כל אישור, תיקון או דחייה נשמרים כאן עם שם בעל התפקיד ותאריך."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <ul className="space-y-3">
              {decisions.map((decision) => (
                <li key={decision.id} className="border-s-2 border-line ps-3">
                  <p className="text-[13px] font-medium text-ink">
                    {PROFESSIONAL_DECISION_KIND_LABELS[decision.kind]}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-soft">{decision.decision}</p>
                  {decision.notes ? (
                    <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">{decision.notes}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {decision.userName} · {USER_ROLE_LABELS[decision.role]} ·{" "}
                    <span className="font-numeric">{formatDateTime(decision.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
