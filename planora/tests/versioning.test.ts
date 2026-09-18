import { describe, expect, it } from "vitest";

import { comparePlans } from "@/lib/drawing/compare";
import { modifiedApartment42, standardApartment42 } from "@/lib/drawing/demo/apartment-42";
import { computeBounds, elementById, lengthInMeters, roomOf } from "@/lib/drawing/geometry";
import { demoDrawingProcessor } from "@/lib/drawing/processors/demo";
import { AutodeskDrawingProcessor } from "@/lib/drawing/processors/future";
import { getDrawingProcessor } from "@/lib/drawing";

describe("גרסאות תוכנית", () => {
  it("תוכנית הסטנדרט אינה משתנה כשנוצרת תוכנית שינויים", () => {
    const before = standardApartment42();
    modifiedApartment42();
    const after = standardApartment42();

    expect(after).toEqual(before);
    expect(after.elements).toHaveLength(before.elements.length);
  });

  it("תוכנית השינויים מבוססת על הסטנדרט ושומרת על מזהי האלמנטים", () => {
    const standard = standardApartment42();
    const modified = modifiedApartment42();

    const survivingIds = standard.elements
      .map((element) => element.id)
      .filter((id) => id !== "W-01");

    for (const id of survivingIds) {
      expect(elementById(modified, id)).toBeDefined();
    }
  });

  it("אלמנט שבוטל אינו קיים בגרסה החדשה אך נשמר בסטנדרט", () => {
    expect(elementById(standardApartment42(), "W-01")).toBeDefined();
    expect(elementById(modifiedApartment42(), "W-01")).toBeUndefined();
  });

  it("השוואה בין גרסאות זהות אינה מייצרת שינויים", () => {
    const modified = modifiedApartment42();
    expect(comparePlans(modified, modified)).toHaveLength(0);
  });

  it("השוואה הפוכה הופכת תוספת לביטול", () => {
    const standard = standardApartment42();
    const modified = modifiedApartment42();

    const forward = comparePlans(standard, modified);
    const backward = comparePlans(modified, standard);

    const addedForward = forward.filter((change) => change.type === "ADDED").length;
    const removedBackward = backward.filter((change) => change.type === "REMOVED").length;

    expect(removedBackward).toBe(addedForward);
  });
});

describe("גאומטריה", () => {
  it("מחשבת אורך במטרים לפי המטא-דאטה של האלמנט", () => {
    const wall = elementById(standardApartment42(), "W-03");
    expect(wall).toBeDefined();
    expect(lengthInMeters(wall!)).toBe(11.2);
  });

  it("מזהה את החלל שאליו שייך אלמנט", () => {
    const document = standardApartment42();
    const outlet = elementById(document, "OUT-01");
    expect(roomOf(document, outlet!)).toBe("סלון ופינת אוכל");
  });

  it("מחשבת תיבה תוחמת שמכילה את כל האלמנטים", () => {
    const document = standardApartment42();
    const bounds = computeBounds(document.elements, 0);

    for (const element of document.elements) {
      expect(element.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(element.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(element.x + element.width).toBeLessThanOrEqual(bounds.minX + bounds.width);
      expect(element.y + element.height).toBeLessThanOrEqual(bounds.minY + bounds.height);
    }
  });
});

describe("DrawingProcessor", () => {
  it("המעבד הפעיל הוא מעבד ההדגמה", () => {
    expect(getDrawingProcessor().engine).toBe("planora-demo");
  });

  it("מעבד ההדגמה משווה תוכניות ומחזיר את אותן תוצאות כמו המנוע", async () => {
    const standard = standardApartment42();
    const modified = modifiedApartment42();

    const viaProcessor = await demoDrawingProcessor.comparePlans(standard, modified);
    expect(viaProcessor).toEqual(comparePlans(standard, modified));
  });

  it("מעבד ההדגמה מפיק תצוגה מקדימה ללא מידע עסקי", async () => {
    const preview = await demoDrawingProcessor.generatePreview(standardApartment42());
    expect(preview.svg).toContain("<svg");
    expect(preview.svg).not.toContain("שקע");
  });

  it("מעבד עתידי אינו ממומש ואינו ניתן להפעלה בטעות", async () => {
    const processor = new AutodeskDrawingProcessor();
    await expect(processor.processFile({ fileName: "plan.dwg" })).rejects.toThrow();
  });
});
