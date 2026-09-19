import { describe, expect, it } from "vitest";

import {
  JOURNEY_STAGES,
  computeJourney,
  evaluateChangeWindow,
} from "@/lib/tenant/journey";

describe("מסע הדייר", () => {
  it("דירה בסטנדרט נמצאת בשלב בחירת השינויים", () => {
    const journey = computeJourney({ status: "STANDARD" });
    expect(journey.stepText).toBe(`שלב 2 מתוך ${JOURNEY_STAGES.length}`);
    expect(journey.stages[0].state).toBe("DONE");
    expect(journey.stages[1].state).toBe("IN_PROGRESS");
    expect(journey.stages[2].state).toBe("PENDING");
  });

  it("דירה שאושרה לביצוע מסמנת את כל השלבים כהושלמו", () => {
    const journey = computeJourney({ status: "APPROVED_FOR_EXECUTION" });
    expect(journey.percent).toBe(100);
    expect(journey.stages.every((stage) => stage.state === "DONE")).toBe(true);
  });

  it("ההתקדמות עולה ככל שהתהליך מתקדם", () => {
    const early = computeJourney({ status: "STANDARD" }).percent;
    const middle = computeJourney({ status: "AWAITING_PRICING" }).percent;
    const late = computeJourney({ status: "PAID" }).percent;
    expect(early).toBeLessThan(middle);
    expect(middle).toBeLessThan(late);
  });

  it("הצעת מחיר שממתינה לאישור מעבירה את הכדור לדייר", () => {
    const journey = computeJourney({
      status: "AWAITING_PRICING",
      hasPricingAwaitingApproval: true,
    });
    expect(journey.nextAction.isTenantTurn).toBe(true);
    expect(journey.nextAction.title).toBe("לאשר את הצעת המחיר");
    expect(journey.nextAction.href).toBe("/tenant/pricing");
  });

  it("בזמן בדיקה מקצועית לא נדרשת פעולה מהדייר", () => {
    const journey = computeJourney({ status: "AWAITING_REVIEW" });
    expect(journey.nextAction.isTenantTurn).toBe(false);
    expect(journey.nextAction.href).toBeUndefined();
  });

  it("ממתין ליועץ אינו מציג מונח פנימי", () => {
    const journey = computeJourney({ status: "AWAITING_CONSULTANT" });
    expect(journey.currentLabel).toBe("אישור יועץ");
    for (const stage of journey.stages) {
      expect(stage.label).not.toMatch(/[A-Z_]{4,}/);
    }
  });

  it("סגירת חלון השינויים משנה את הפעולה הנדרשת", () => {
    const journey = computeJourney({ status: "STANDARD", changesWindowClosed: true });
    expect(journey.nextAction.isTenantTurn).toBe(false);
    expect(journey.nextAction.title).toContain("הסתיימה");
  });
});

describe("חלון שינויי הדיירים", () => {
  const now = new Date("2026-06-15T10:00:00Z");

  it("פתוח בתוך התקופה", () => {
    const result = evaluateChangeWindow({
      openDate: new Date("2026-05-01"),
      closeDate: new Date("2026-08-01"),
      now,
    });
    expect(result.isOpen).toBe(true);
  });

  it("סגור לפני מועד הפתיחה", () => {
    const result = evaluateChangeWindow({ openDate: new Date("2026-07-01"), now });
    expect(result.isOpen).toBe(false);
    expect(result.message).toContain("טרם נפתחה");
  });

  it("סגור אחרי מועד הסגירה", () => {
    const result = evaluateChangeWindow({ closeDate: new Date("2026-06-01"), now });
    expect(result.isOpen).toBe(false);
    expect(result.message).toBe("תקופת שינויי הדיירים הסתיימה.");
  });

  it("פתוח כאשר לא הוגדרו תאריכים", () => {
    expect(evaluateChangeWindow({ now }).isOpen).toBe(true);
  });
});
