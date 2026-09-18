import { describe, expect, it } from "vitest";

import { evaluateRules, matchesCondition } from "@/lib/rules/engine";
import { SYSTEM_RULES } from "@/lib/rules/system-rules";
import type { RuleDefinition, RuleInput } from "@/lib/rules/types";

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    categoryKey: "ELECTRICAL",
    changeType: "ADDED",
    elementType: "OUTLET",
    confidence: 0.99,
    ...overrides,
  };
}

describe("matchesCondition", () => {
  it("מתאים לפי קטגוריה וסוג שינוי", () => {
    const condition = { categoryKey: "PLUMBING" as const, changeType: "MOVED" as const };
    expect(
      matchesCondition(condition, input({ categoryKey: "PLUMBING", changeType: "MOVED" })),
    ).toBe(true);
    expect(
      matchesCondition(condition, input({ categoryKey: "PLUMBING", changeType: "ADDED" })),
    ).toBe(false);
  });

  it("תומך ברשימת ערכים", () => {
    const condition = { categoryKey: ["PLUMBING", "SANITARY"] satisfies RuleInput["categoryKey"][] };
    expect(matchesCondition(condition, input({ categoryKey: "SANITARY" }))).toBe(true);
    expect(matchesCondition(condition, input({ categoryKey: "ELECTRICAL" }))).toBe(false);
  });

  it("מתאים לפי תג הנדסי של האלמנט", () => {
    const condition = { elementTag: "W15" };
    expect(matchesCondition(condition, input({ elementTag: "W15" }))).toBe(true);
    expect(matchesCondition(condition, input({ elementTag: "W11" }))).toBe(false);
    expect(matchesCondition(condition, input({ elementTag: null }))).toBe(false);
  });

  it("מתאים לפי רמת ודאות מתחת לסף", () => {
    const condition = { confidenceBelow: 0.85 };
    expect(matchesCondition(condition, input({ confidence: 0.7 }))).toBe(true);
    expect(matchesCondition(condition, input({ confidence: 0.85 }))).toBe(false);
  });

  it("תומך ב-all, any ו-not", () => {
    const condition = {
      all: [{ categoryKey: "HVAC" as const }, { changeType: "MOVED" as const }],
    };
    expect(matchesCondition(condition, input({ categoryKey: "HVAC", changeType: "MOVED" }))).toBe(
      true,
    );
    expect(matchesCondition(condition, input({ categoryKey: "HVAC", changeType: "ADDED" }))).toBe(
      false,
    );

    expect(
      matchesCondition({ any: [{ categoryKey: "HVAC" as const }, { categoryKey: "WALL" as const }] }, input({ categoryKey: "WALL" })),
    ).toBe(true);

    expect(matchesCondition({ not: { categoryKey: "HVAC" as const } }, input())).toBe(true);
  });

  it("מתאים רק לשינויים שנקלטו אחרי תאריך", () => {
    const condition = { occurredAfter: "2026-01-01T00:00:00.000Z" };
    expect(matchesCondition(condition, input({ occurredAt: new Date("2026-06-01") }))).toBe(true);
    expect(matchesCondition(condition, input({ occurredAt: new Date("2025-06-01") }))).toBe(false);
  });
});

describe("evaluateRules — כללי המערכת", () => {
  it("הזזת נקודת אינסטלציה דורשת אישור יועץ אינסטלציה", () => {
    const result = evaluateRules(
      SYSTEM_RULES,
      input({ categoryKey: "PLUMBING", changeType: "MOVED", elementType: "WATER_POINT" }),
    );

    expect(result.requiresConsultant).toBe(true);
    expect(result.consultantKind).toBe("PLUMBING");
  });

  it("כל שינוי מיזוג דורש אישור יועץ מיזוג", () => {
    const result = evaluateRules(
      SYSTEM_RULES,
      input({ categoryKey: "HVAC", changeType: "ADDED", elementType: "HVAC" }),
    );

    expect(result.requiresConsultant).toBe(true);
    expect(result.consultantKind).toBe("HVAC");
  });

  it("שינוי באלמנט קונסטרוקטיבי חוסם המשך אוטומטי", () => {
    const result = evaluateRules(
      SYSTEM_RULES,
      input({ categoryKey: "WALL", changeType: "REMOVED", elementType: "WALL", structural: true }),
    );

    expect(result.blockedFromAutomation).toBe(true);
    // יועץ קונסטרוקציה גובר על יועצים אחרים
    expect(result.consultantKind).toBe("STRUCTURAL");
  });

  it("רמת ודאות נמוכה מחייבת בדיקה אנושית", () => {
    const result = evaluateRules(SYSTEM_RULES, input({ confidence: 0.6 }));
    expect(result.requiresManagerReview).toBe(true);
  });

  it("שקע שנוסף בוודאות גבוהה אינו דורש יועץ ואינו חוסם", () => {
    const result = evaluateRules(SYSTEM_RULES, input({ confidence: 0.99 }));

    expect(result.requiresConsultant).toBe(false);
    expect(result.blockedFromAutomation).toBe(false);
    expect(result.requiresManagerReview).toBe(false);
  });

  it("כלל פרויקט מתווסף לכללי המערכת ואינו מבטל אותם", () => {
    const projectRule: RuleDefinition = {
      key: "PRJ_W15_LOCKED",
      name: "קיר W15 אינו ניתן לשינוי",
      description: "בקיר W15 עוברת צנרת אנכית משותפת.",
      condition: { elementTag: "W15" },
      effect: "BLOCK_AUTOMATIC_WORKFLOW",
      severity: "BLOCKING",
      isSystem: false,
    };

    const result = evaluateRules(
      [...SYSTEM_RULES, projectRule],
      input({ categoryKey: "WALL", changeType: "REMOVED", elementType: "PARTITION", elementTag: "W15" }),
    );

    expect(result.blockedFromAutomation).toBe(true);
    expect(result.hits.map((hit) => hit.ruleKey)).toContain("PRJ_W15_LOCKED");
    expect(result.hits.map((hit) => hit.ruleKey)).toContain("SYS_WALL_REMOVED");
  });

  it("הערכה זהה עבור אותו קלט — המנוע דטרמיניסטי", () => {
    const sample = input({ categoryKey: "PLUMBING", changeType: "MOVED" });
    const first = evaluateRules(SYSTEM_RULES, sample);
    const second = evaluateRules(SYSTEM_RULES, sample);
    expect(first).toEqual(second);
  });
});
