import { describe, expect, it } from "vitest";

import {
  buildPricingLines,
  computeTotals,
  isPriceable,
  lineTotal,
  matchPriceBookItem,
  type ChangeItemLike,
  type PriceBookItemLike,
} from "@/lib/pricing/engine";

const priceBook: PriceBookItemLike[] = [
  {
    id: "pb-outlet-added",
    code: "EL-01",
    name: "שקע נוסף",
    categoryKey: "ELECTRICAL",
    changeType: "ADDED",
    unit: "UNIT",
    unitPrice: 185,
    vatBehavior: "ADD_VAT",
    isActive: true,
  },
  {
    id: "pb-outlet-moved",
    code: "EL-02",
    name: "הזזת שקע",
    categoryKey: "ELECTRICAL",
    changeType: "MOVED",
    unit: "UNIT",
    unitPrice: 120,
    vatBehavior: "ADD_VAT",
    isActive: true,
  },
  {
    id: "pb-wall-any",
    code: "WL-00",
    name: "עבודות גבס",
    categoryKey: "WALL",
    changeType: null,
    unit: "METER",
    unitPrice: 320,
    vatBehavior: "ADD_VAT",
    isActive: true,
  },
  {
    id: "pb-inactive",
    code: "EL-99",
    name: "סעיף לא פעיל",
    categoryKey: "ELECTRICAL",
    changeType: "REMOVED",
    unit: "UNIT",
    unitPrice: 50,
    vatBehavior: "ADD_VAT",
    isActive: false,
  },
];

function change(overrides: Partial<ChangeItemLike> = {}): ChangeItemLike {
  return {
    id: "ci-1",
    code: "CH-101",
    description: "התווסף שקע",
    categoryKey: "ELECTRICAL",
    type: "ADDED",
    status: "CONFIRMED",
    quantity: 1,
    unit: "UNIT",
    ...overrides,
  };
}

describe("isPriceable", () => {
  it("מתמחר רק שינויים שהוכרעו בחיוב", () => {
    expect(isPriceable(change({ status: "CONFIRMED" }))).toBe(true);
    expect(isPriceable(change({ status: "CONSULTANT_APPROVED" }))).toBe(true);
    expect(isPriceable(change({ status: "CONSULTANT_CONDITIONAL" }))).toBe(true);
  });

  it("אינו מתמחר שינוי שממתין לבדיקה, נדחה או ממתין ליועץ", () => {
    expect(isPriceable(change({ status: "DETECTED" }))).toBe(false);
    expect(isPriceable(change({ status: "REJECTED" }))).toBe(false);
    expect(isPriceable(change({ status: "DISMISSED" }))).toBe(false);
    expect(isPriceable(change({ status: "AWAITING_CONSULTANT" }))).toBe(false);
  });
});

describe("matchPriceBookItem", () => {
  it("התאמה מדויקת גוברת על התאמה כללית", () => {
    const match = matchPriceBookItem(change({ type: "MOVED" }), priceBook);
    expect(match?.code).toBe("EL-02");
  });

  it("נופל להתאמה לפי קטגוריה כשאין סוג תואם", () => {
    const match = matchPriceBookItem(
      change({ categoryKey: "WALL", type: "REMOVED", unit: "METER", quantity: 4 }),
      priceBook,
    );
    expect(match?.code).toBe("WL-00");
  });

  it("אינו בוחר סעיף לא פעיל", () => {
    const match = matchPriceBookItem(change({ type: "REMOVED" }), priceBook);
    expect(match).toBeNull();
  });
});

describe("buildPricingLines", () => {
  it("בונה שורות רק מהשינויים המאושרים", () => {
    const { lines } = buildPricingLines(
      [
        change({ id: "a", status: "CONFIRMED" }),
        change({ id: "b", status: "DETECTED" }),
        change({ id: "c", status: "REJECTED" }),
      ],
      priceBook,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].changeItemId).toBe("a");
    expect(lines[0].unitPrice).toBe(185);
    expect(lines[0].source).toBe("AUTOMATIC");
  });

  it("מסמן שורה ידנית כאשר אין סעיף מחירון מתאים", () => {
    const { lines, unmatched } = buildPricingLines(
      [change({ id: "x", categoryKey: "HVAC", type: "MOVED" })],
      priceBook,
    );

    expect(unmatched).toHaveLength(1);
    expect(lines[0].source).toBe("MANUAL");
    expect(lines[0].unitPrice).toBe(0);
  });

  it("שומר על הכמות שנספרה מהתוכנית", () => {
    const { lines } = buildPricingLines(
      [change({ categoryKey: "WALL", type: "ADDED", quantity: 2.8, unit: "METER" })],
      priceBook,
    );

    expect(lines[0].quantity).toBe(2.8);
    expect(lines[0].unit).toBe("METER");
    expect(lineTotal(lines[0])).toBe(896);
  });
});

describe("computeTotals", () => {
  it("מחשב סכום, מע\"מ וסה\"כ", () => {
    const totals = computeTotals([
      { quantity: 7, unitPrice: 185 },
      { quantity: 3, unitPrice: 120 },
    ]);

    expect(totals.subtotal).toBe(1655);
    expect(totals.vat).toBe(297.9);
    expect(totals.total).toBe(1952.9);
  });

  it("מחשב הנחה לפני מע\"מ", () => {
    const totals = computeTotals([{ quantity: 1, unitPrice: 1000 }], { discount: 200 });

    expect(totals.net).toBe(800);
    expect(totals.vat).toBe(144);
    expect(totals.total).toBe(944);
  });

  it("הנחה אינה יכולה לעלות על הסכום", () => {
    const totals = computeTotals([{ quantity: 1, unitPrice: 500 }], { discount: 900 });
    expect(totals.discount).toBe(500);
    expect(totals.total).toBe(0);
  });

  it("מכבד שיעור מע\"מ אחר", () => {
    const totals = computeTotals([{ quantity: 1, unitPrice: 1000 }], { vatRate: 17 });
    expect(totals.vat).toBe(170);
  });
});
