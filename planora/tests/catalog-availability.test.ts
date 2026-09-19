import { describe, expect, it } from "vitest";

import {
  evaluateProductAvailability,
  isQuantityAllowed,
  isSelectable,
  selectionPrice,
  type AvailabilityRecord,
} from "@/lib/catalog/availability";

function record(overrides: Partial<AvailabilityRecord> = {}): AvailabilityRecord {
  return {
    available: true,
    includedInStandard: false,
    upgradePrice: 4800,
    requiresApproval: false,
    requiresConsultant: false,
    minimumRooms: null,
    maximumQuantity: null,
    ...overrides,
  };
}

describe("שער הזמינות של המוצרים", () => {
  it("מוצר שאינו משויך לפרויקט אינו קיים מבחינת הדייר", () => {
    const result = evaluateProductAvailability(null, { rooms: 4 });
    expect(result.eligibility).toBe("UNAVAILABLE");
    expect(isSelectable(result)).toBe(false);
  });

  it("מוצר שסומן כלא זמין אינו מוצג", () => {
    const result = evaluateProductAvailability(record({ available: false }), { rooms: 4 });
    expect(result.eligibility).toBe("UNAVAILABLE");
  });

  it("מוצר שאינו מתאים לטיפוס הדירה אינו מוצג", () => {
    expect(
      evaluateProductAvailability(record({ minimumRooms: 4 }), { rooms: 3 }).eligibility,
    ).toBe("UNAVAILABLE");
    expect(
      evaluateProductAvailability(record({ minimumRooms: 4 }), { rooms: 4 }).eligibility,
    ).toBe("UPGRADE");
  });

  it("דירה ללא טיפוס אינה עוברת מגבלת חדרים", () => {
    expect(
      evaluateProductAvailability(record({ minimumRooms: 4 }), { rooms: null }).eligibility,
    ).toBe("UNAVAILABLE");
  });

  it("מוצר סטנדרט מוצג ללא תוספת תשלום", () => {
    const result = evaluateProductAvailability(
      record({ includedInStandard: true, upgradePrice: 4800 }),
      { rooms: 4 },
    );
    expect(result.eligibility).toBe("INCLUDED");
    expect(result.price).toBe(0);
  });

  it("מוצר שדורש אישור מסומן כדורש בדיקה ומסביר למה", () => {
    const result = evaluateProductAvailability(record({ requiresApproval: true }), { rooms: 4 });
    expect(result.eligibility).toBe("NEEDS_REVIEW");
    expect(result.reason).toContain("מנהלת שינויי הדיירים");
  });

  it("מוצר שדורש יועץ מסביר זאת בנפרד", () => {
    const result = evaluateProductAvailability(record({ requiresConsultant: true }), { rooms: 4 });
    expect(result.reason).toContain("יועץ");
  });

  it("מחיר הבחירה כולל את תוספת הווריאנט ואת הכמות", () => {
    const result = evaluateProductAvailability(record(), { rooms: 4 });
    expect(selectionPrice(result, 900)).toBe(5700);
    expect(selectionPrice(result, 0, 2)).toBe(9600);
  });

  it("מוצר שאינו זמין אינו מתומחר", () => {
    const result = evaluateProductAvailability(null, { rooms: 4 });
    expect(selectionPrice(result, 900, 3)).toBe(0);
  });

  it("מכבד מגבלת כמות מרבית", () => {
    const result = evaluateProductAvailability(record({ maximumQuantity: 2 }), { rooms: 4 });
    expect(isQuantityAllowed(result, 2)).toBe(true);
    expect(isQuantityAllowed(result, 3)).toBe(false);
    expect(isQuantityAllowed(result, 0)).toBe(false);
  });
});
