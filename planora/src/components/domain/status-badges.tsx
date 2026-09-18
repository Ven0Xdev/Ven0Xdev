import type {
  ApartmentStatus,
  ApprovalStatus,
  AssignmentStatus,
  ChangeItemStatus,
  ChangeType,
  ConsultantDecision,
  ConsultantRequestStatus,
  PlanVersionStatus,
  PricingSheetStatus,
  ReviewStatus,
  RuleSeverity,
} from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  APARTMENT_STATUS_LABELS,
  APARTMENT_STATUS_TONE,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_TONE,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_TONE,
  CHANGE_ITEM_STATUS_LABELS,
  CHANGE_ITEM_STATUS_TONE,
  CHANGE_TYPE_LABELS,
  CHANGE_TYPE_TONE,
  CONSULTANT_DECISION_LABELS,
  CONSULTANT_DECISION_TONE,
  CONSULTANT_REQUEST_STATUS_LABELS,
  CONSULTANT_REQUEST_STATUS_TONE,
  PLAN_VERSION_STATUS_LABELS,
  PLAN_VERSION_STATUS_TONE,
  PRICING_SHEET_STATUS_LABELS,
  PRICING_SHEET_STATUS_TONE,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONE,
  RULE_SEVERITY_LABELS,
  RULE_SEVERITY_TONE,
} from "@/lib/i18n/he";
import {
  CONFIDENCE_BAND_LABELS,
  CONFIDENCE_BAND_TONE,
  confidenceBand,
  confidencePercent,
} from "@/lib/changes/confidence";

export function ApartmentStatusBadge({ status }: { status: ApartmentStatus }) {
  return (
    <Badge tone={APARTMENT_STATUS_TONE[status]} dot>
      {APARTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ChangeItemStatusBadge({ status }: { status: ChangeItemStatus }) {
  return <Badge tone={CHANGE_ITEM_STATUS_TONE[status]}>{CHANGE_ITEM_STATUS_LABELS[status]}</Badge>;
}

export function ChangeTypeBadge({ type }: { type: ChangeType }) {
  return (
    <Badge tone={CHANGE_TYPE_TONE[type]} dot>
      {CHANGE_TYPE_LABELS[type]}
    </Badge>
  );
}

export function PlanVersionStatusBadge({ status }: { status: PlanVersionStatus }) {
  return <Badge tone={PLAN_VERSION_STATUS_TONE[status]}>{PLAN_VERSION_STATUS_LABELS[status]}</Badge>;
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_STATUS_TONE[status]}>{REVIEW_STATUS_LABELS[status]}</Badge>;
}

export function ConsultantRequestStatusBadge({ status }: { status: ConsultantRequestStatus }) {
  return (
    <Badge tone={CONSULTANT_REQUEST_STATUS_TONE[status]}>
      {CONSULTANT_REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ConsultantDecisionBadge({ decision }: { decision: ConsultantDecision }) {
  return (
    <Badge tone={CONSULTANT_DECISION_TONE[decision]}>
      {CONSULTANT_DECISION_LABELS[decision]}
    </Badge>
  );
}

export function PricingStatusBadge({ status }: { status: PricingSheetStatus }) {
  return <Badge tone={PRICING_SHEET_STATUS_TONE[status]}>{PRICING_SHEET_STATUS_LABELS[status]}</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={APPROVAL_STATUS_TONE[status]}>{APPROVAL_STATUS_LABELS[status]}</Badge>;
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <Badge tone={ASSIGNMENT_STATUS_TONE[status]}>{ASSIGNMENT_STATUS_LABELS[status]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: RuleSeverity }) {
  return <Badge tone={RULE_SEVERITY_TONE[severity]}>{RULE_SEVERITY_LABELS[severity]}</Badge>;
}

/**
 * רמת ודאות בזיהוי.
 * מוצגת תמיד עם הסבר מילולי — לעולם לא כמספר עירום.
 */
export function ConfidenceBadge({
  confidence,
  showValue = true,
}: {
  confidence: number;
  showValue?: boolean;
}) {
  const band = confidenceBand(confidence);

  return (
    <Badge tone={CONFIDENCE_BAND_TONE[band]}>
      {CONFIDENCE_BAND_LABELS[band]}
      {showValue ? (
        <span className="font-numeric opacity-80">{confidencePercent(confidence)}</span>
      ) : null}
    </Badge>
  );
}
