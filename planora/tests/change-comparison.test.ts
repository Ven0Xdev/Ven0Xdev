import { describe, expect, it } from "vitest";

import { comparePlans, compareQuantities } from "@/lib/drawing/compare";
import { modifiedApartment42, standardApartment42 } from "@/lib/drawing/demo/apartment-42";
import { confidenceBand, confidenceText, computeConfidence } from "@/lib/changes/confidence";
import { describeChange } from "@/lib/changes/describe";

const standard = standardApartment42();
const modified = modifiedApartment42();
const changes = comparePlans(standard, modified);

describe("comparePlans — דירת ההדגמה", () => {
  it("מזהה בדיוק 17 שינויים מול תוכנית הסטנדרט", () => {
    expect(changes).toHaveLength(17);
  });

  it("מזהה 7 שקעים שנוספו ו-3 שהוזזו", () => {
    const outlets = changes.filter((change) => change.elementType === "OUTLET");
    expect(outlets.filter((change) => change.type === "ADDED")).toHaveLength(7);
    expect(outlets.filter((change) => change.type === "MOVED")).toHaveLength(3);
  });

  it("מזהה ביטול קיר ותוספת מחיצה", () => {
    const walls = changes.filter((change) => change.categoryKey === "WALL");
    expect(walls.filter((change) => change.type === "REMOVED")).toHaveLength(1);

    const added = walls.find((change) => change.type === "ADDED");
    expect(added?.quantity).toBe(2.8);
    expect(added?.unit).toBe("METER");
  });

  it("מזהה הזזת אסלה של 70 ס\"מ", () => {
    const toilet = changes.find((change) => change.elementId === "SAN-01");
    expect(toilet?.type).toBe("MOVED");
    expect(toilet?.distanceCm).toBe(70);
    expect(toilet?.description).toBe('אסלה הוזזה 70 ס"מ');
  });

  it("מזהה שתי נקודות תאורה שנוספו", () => {
    const lights = changes.filter(
      (change) => change.categoryKey === "LIGHTING" && change.type === "ADDED",
    );
    expect(lights).toHaveLength(2);
  });

  it("מזהה הזזת דלת אחת", () => {
    const doors = changes.filter((change) => change.categoryKey === "DOOR");
    expect(doors).toHaveLength(1);
    expect(doors[0].type).toBe("MOVED");
  });

  it("ההשוואה דטרמיניסטית — אותה קלט מחזיר אותה תוצאה", () => {
    expect(comparePlans(standard, modified)).toEqual(changes);
  });

  it("השוואה של תוכנית לעצמה אינה מייצרת שינויים", () => {
    expect(comparePlans(standard, standard)).toHaveLength(0);
  });

  it("כל שינוי מקבל תיאור בעברית וקטגוריה", () => {
    for (const change of changes) {
      expect(change.description.length).toBeGreaterThan(3);
      expect(change.description).not.toMatch(/[A-Z]{3,}/);
      expect(change.categoryKey).toBeTruthy();
    }
  });
});

describe("compareQuantities", () => {
  const rows = compareQuantities(standard, modified);

  it("סופר 34 שקעים בסטנדרט ו-41 בתוכנית השינויים", () => {
    const outlets = rows.find((row) => row.elementType === "OUTLET");
    expect(outlets?.standard).toBe(34);
    expect(outlets?.modified).toBe(41);
    expect(outlets?.difference).toBe(7);
  });

  it("סופר 12 נקודות תאורה בסטנדרט ו-14 בשינויים", () => {
    const lights = rows.find((row) => row.elementType === "LIGHT");
    expect(lights?.standard).toBe(12);
    expect(lights?.modified).toBe(14);
  });

  it("נקודת מים שהוזזה אינה משנה את הכמות", () => {
    const water = rows.find((row) => row.elementType === "WATER_POINT");
    expect(water?.standard).toBe(6);
    expect(water?.modified).toBe(6);
    expect(water?.difference).toBe(0);
  });
});

describe("רמת ודאות בזיהוי", () => {
  it("מסווגת לפי הספים שהוגדרו", () => {
    expect(confidenceBand(0.99)).toBe("HIGH");
    expect(confidenceBand(0.97)).toBe("HIGH");
    expect(confidenceBand(0.9)).toBe("VERIFY");
    expect(confidenceBand(0.85)).toBe("VERIFY");
    expect(confidenceBand(0.84)).toBe("MANUAL");
  });

  it("מציגה ניסוח מלא בעברית ולא מספר עירום", () => {
    expect(confidenceText(0.98)).toBe("רמת ודאות בזיהוי: 98%");
  });

  it("מורידה ודאות בקטגוריות מערכתיות", () => {
    const electrical = computeConfidence({ type: "MOVED", categoryKey: "ELECTRICAL" });
    const plumbing = computeConfidence({ type: "MOVED", categoryKey: "PLUMBING" });
    expect(plumbing).toBeLessThan(electrical);
  });

  it("מכבדת ערך שנקבע ידנית", () => {
    expect(computeConfidence({ type: "ADDED", categoryKey: "ELECTRICAL", override: 0.5 })).toBe(0.5);
  });
});

describe("describeChange — ניסוח בעברית", () => {
  it("מנסח תוספת בזכר ובנקבה", () => {
    expect(describeChange({ type: "ADDED", elementType: "OUTLET" })).toBe("התווסף שקע");
    expect(describeChange({ type: "ADDED", elementType: "LIGHT" })).toBe("התווספה נקודת תאורה");
  });

  it("מנסח ביטול והזזה", () => {
    expect(describeChange({ type: "REMOVED", elementType: "WALL" })).toBe("קיר בוטל");
    expect(describeChange({ type: "MOVED", elementType: "OUTLET", distanceCm: 60 })).toBe(
      'שקע הוזז 60 ס"מ',
    );
  });

  it("מנסח שינוי לפי קטגוריה", () => {
    expect(describeChange({ type: "MODIFIED", elementType: "WATER_POINT" })).toBe(
      "בוצע שינוי באינסטלציה",
    );
  });
});
