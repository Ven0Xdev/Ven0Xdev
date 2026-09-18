/**
 * מנוע כללים דטרמיניסטי.
 *
 * הכללים אינם מאשרים דבר. הם קובעים מה דורש בדיקה אנושית, מה דורש אישור יועץ
 * ומה חוסם המשך אוטומטי של התהליך. ההחלטה עצמה תמיד נשארת אצל אדם מורשה.
 */

import { z } from "zod";
import type {
  ChangeCategoryKey,
  ChangeType,
  ConsultantKind,
  RuleEffect,
  RuleSeverity,
} from "@prisma/client";

const CATEGORY_KEYS = [
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
] as const;

const CHANGE_TYPES = ["ADDED", "REMOVED", "MOVED", "MODIFIED", "UNKNOWN"] as const;

const oneOrMany = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.array(z.enum(values))]).optional();

const baseCondition = z.object({
  categoryKey: oneOrMany(CATEGORY_KEYS),
  changeType: oneOrMany(CHANGE_TYPES),
  elementType: z.union([z.string(), z.array(z.string())]).optional(),
  /** תג הנדסי מהתוכנית, למשל "W15" */
  elementTag: z.union([z.string(), z.array(z.string())]).optional(),
  /** אלמנט קונסטרוקטיבי */
  structural: z.boolean().optional(),
  /** רמת ודאות בזיהוי מתחת לערך הזה */
  confidenceBelow: z.number().min(0).max(1).optional(),
  /** מרחק הזזה בס"מ מעל הערך הזה */
  distanceAboveCm: z.number().optional(),
  roomIn: z.array(z.string()).optional(),
  /** חל רק על שינויים שנקלטו אחרי התאריך הזה (ISO) */
  occurredAfter: z.string().optional(),
});

export type RuleConditionLeaf = z.infer<typeof baseCondition>;

export type RuleCondition = RuleConditionLeaf & {
  all?: RuleCondition[];
  any?: RuleCondition[];
  not?: RuleCondition;
};

export const ruleConditionSchema: z.ZodType<RuleCondition> = baseCondition.extend({
  all: z.lazy(() => z.array(ruleConditionSchema)).optional(),
  any: z.lazy(() => z.array(ruleConditionSchema)).optional(),
  not: z.lazy(() => ruleConditionSchema).optional(),
});

export interface RuleDefinition {
  key: string;
  name: string;
  description?: string | null;
  condition: RuleCondition;
  effect: RuleEffect;
  consultantKind?: ConsultantKind | null;
  severity: RuleSeverity;
  /** כלל מערכת (true) או כלל שהוגדר בפרויקט (false) */
  isSystem: boolean;
}

/** הקלט שעליו נבחן כל כלל */
export interface RuleInput {
  categoryKey: ChangeCategoryKey;
  changeType: ChangeType;
  elementType: string;
  elementTag?: string | null;
  structural?: boolean;
  confidence: number;
  distanceCm?: number | null;
  roomLabel?: string | null;
  occurredAt?: Date;
}

export interface RuleHit {
  ruleKey: string;
  ruleName: string;
  message: string;
  effect: RuleEffect;
  severity: RuleSeverity;
  consultantKind?: ConsultantKind | null;
  isSystem: boolean;
}

/** התוצאה המצטברת של כל הכללים על שינוי בודד */
export interface RuleEvaluation {
  hits: RuleHit[];
  requiresConsultant: boolean;
  consultantKind: ConsultantKind | null;
  requiresManagerReview: boolean;
  blockedFromAutomation: boolean;
}
