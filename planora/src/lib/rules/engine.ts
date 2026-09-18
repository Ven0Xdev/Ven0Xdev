import type { ConsultantKind } from "@prisma/client";
import { CONFIDENCE_THRESHOLDS } from "@/lib/changes/confidence";
import type { RuleCondition, RuleDefinition, RuleEvaluation, RuleHit, RuleInput } from "./types";

function toArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

/** בדיקת תנאי בודד — ללא תופעות לוואי, ללא אקראיות */
export function matchesCondition(condition: RuleCondition, input: RuleInput): boolean {
  if (condition.all && !condition.all.every((child) => matchesCondition(child, input))) {
    return false;
  }
  if (condition.any && !condition.any.some((child) => matchesCondition(child, input))) {
    return false;
  }
  if (condition.not && matchesCondition(condition.not, input)) {
    return false;
  }

  const categories = toArray(condition.categoryKey);
  if (categories && !categories.includes(input.categoryKey)) return false;

  const changeTypes = toArray(condition.changeType);
  if (changeTypes && !changeTypes.includes(input.changeType)) return false;

  const elementTypes = toArray(condition.elementType);
  if (elementTypes && !elementTypes.includes(input.elementType)) return false;

  const tags = toArray(condition.elementTag);
  if (tags && (!input.elementTag || !tags.includes(input.elementTag))) return false;

  if (condition.structural !== undefined && Boolean(input.structural) !== condition.structural) {
    return false;
  }

  if (condition.confidenceBelow !== undefined && !(input.confidence < condition.confidenceBelow)) {
    return false;
  }

  if (
    condition.distanceAboveCm !== undefined &&
    !((input.distanceCm ?? 0) > condition.distanceAboveCm)
  ) {
    return false;
  }

  if (condition.roomIn && (!input.roomLabel || !condition.roomIn.includes(input.roomLabel))) {
    return false;
  }

  if (condition.occurredAfter) {
    const threshold = new Date(condition.occurredAfter);
    const occurredAt = input.occurredAt ?? new Date();
    if (!(occurredAt.getTime() > threshold.getTime())) return false;
  }

  return true;
}

/** סדר עדיפות לקביעת היועץ הרלוונטי כאשר כמה כללים נדלקו */
const CONSULTANT_PRIORITY: ConsultantKind[] = [
  "STRUCTURAL",
  "PLUMBING",
  "HVAC",
  "ELECTRICAL",
  "ARCHITECT",
  "OTHER",
];

/**
 * מריץ את כל הכללים על שינוי בודד.
 * כללי פרויקט גוברים על כללי מערכת רק במובן זה שהם מתווספים אליהם —
 * אין כלל שמבטל דרישת בדיקה של כלל אחר.
 */
export function evaluateRules(rules: RuleDefinition[], input: RuleInput): RuleEvaluation {
  const hits: RuleHit[] = [];

  for (const rule of rules) {
    if (!matchesCondition(rule.condition, input)) continue;
    hits.push({
      ruleKey: rule.key,
      ruleName: rule.name,
      message: rule.description?.trim() ? rule.description : rule.name,
      effect: rule.effect,
      severity: rule.severity,
      consultantKind: rule.consultantKind ?? null,
      isSystem: rule.isSystem,
    });
  }

  const consultantHits = hits.filter((hit) => hit.effect === "REQUIRE_CONSULTANT");
  const consultantKinds = consultantHits
    .map((hit) => hit.consultantKind)
    .filter((kind): kind is ConsultantKind => Boolean(kind));

  const consultantKind =
    CONSULTANT_PRIORITY.find((kind) => consultantKinds.includes(kind)) ??
    (consultantHits.length > 0 ? "OTHER" : null);

  return {
    hits,
    requiresConsultant: consultantHits.length > 0,
    consultantKind,
    requiresManagerReview:
      hits.some((hit) => hit.effect === "REQUIRE_MANAGER_REVIEW") ||
      input.confidence < CONFIDENCE_THRESHOLDS.high,
    blockedFromAutomation: hits.some((hit) => hit.effect === "BLOCK_AUTOMATIC_WORKFLOW"),
  };
}
