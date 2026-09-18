/**
 * מנוע התמחור.
 *
 * מתומחרים אך ורק שינויים שאושרו על ידי גורם מקצועי. שינוי שממתין לבדיקה,
 * נדחה או ממתין ליועץ אינו נכנס לתמחור.
 */

import type {
  ChangeCategoryKey,
  ChangeItemStatus,
  ChangeType,
  PricingLineSource,
  VatBehavior,
} from "@prisma/client";

export interface PriceBookItemLike {
  id: string;
  code: string;
  name: string;
  categoryKey: ChangeCategoryKey;
  changeType: ChangeType | null;
  unit: string;
  unitPrice: number;
  vatBehavior: VatBehavior;
  isActive: boolean;
}

export interface ChangeItemLike {
  id: string;
  code: string;
  description: string;
  categoryKey: ChangeCategoryKey;
  type: ChangeType;
  status: ChangeItemStatus;
  quantity: number;
  unit: string;
  roomLabel?: string | null;
}

export interface PricingLineDraft {
  changeItemId: string | null;
  priceBookItemId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  source: PricingLineSource;
  sortOrder: number;
}

/** סטטוסים שמותר לתמחר */
export const PRICEABLE_STATUSES: ChangeItemStatus[] = [
  "CONFIRMED",
  "CONSULTANT_APPROVED",
  "CONSULTANT_CONDITIONAL",
  "PRICED",
];

export function isPriceable(item: ChangeItemLike): boolean {
  return PRICEABLE_STATUSES.includes(item.status);
}

/**
 * מוצא את סעיף המחירון המתאים ביותר לשינוי.
 * התאמה מדויקת (קטגוריה + סוג שינוי) גוברת על התאמה כללית לקטגוריה.
 */
export function matchPriceBookItem(
  item: ChangeItemLike,
  priceBookItems: PriceBookItemLike[],
): PriceBookItemLike | null {
  const active = priceBookItems.filter((entry) => entry.isActive);

  const exact = active.find(
    (entry) => entry.categoryKey === item.categoryKey && entry.changeType === item.type,
  );
  if (exact) return exact;

  const byCategory = active.find(
    (entry) => entry.categoryKey === item.categoryKey && entry.changeType === null,
  );
  return byCategory ?? null;
}

/** בונה את שורות התמחור מתוך השינויים המאושרים */
export function buildPricingLines(
  items: ChangeItemLike[],
  priceBookItems: PriceBookItemLike[],
): { lines: PricingLineDraft[]; unmatched: ChangeItemLike[] } {
  const lines: PricingLineDraft[] = [];
  const unmatched: ChangeItemLike[] = [];

  const priceable = items.filter(isPriceable);

  priceable.forEach((item, index) => {
    const match = matchPriceBookItem(item, priceBookItems);

    if (!match) {
      unmatched.push(item);
      lines.push({
        changeItemId: item.id,
        priceBookItemId: null,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: 0,
        source: "MANUAL",
        sortOrder: index,
      });
      return;
    }

    lines.push({
      changeItemId: item.id,
      priceBookItemId: match.id,
      description: match.name,
      quantity: item.quantity,
      unit: match.unit === "UNIT" ? item.unit : match.unit,
      unitPrice: match.unitPrice,
      source: "AUTOMATIC",
      sortOrder: index,
    });
  });

  return { lines, unmatched };
}

export interface PricingTotals {
  subtotal: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  lineCount: number;
}

export interface PricingLineLike {
  quantity: number;
  unitPrice: number;
}

/** חישוב סיכום התמחור. ההנחה מחושבת לפני מע"מ. */
export function computeTotals(
  lines: PricingLineLike[],
  options: { discount?: number; vatRate?: number } = {},
): PricingTotals {
  const discount = Math.max(0, options.discount ?? 0);
  const vatRate = options.vatRate ?? 18;

  const subtotal = round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  const effectiveDiscount = Math.min(discount, subtotal);
  const net = round(subtotal - effectiveDiscount);
  const vat = round(net * (vatRate / 100));

  return {
    subtotal,
    discount: round(effectiveDiscount),
    net,
    vat,
    total: round(net + vat),
    lineCount: lines.length,
  };
}

export function lineTotal(line: PricingLineLike): number {
  return round(line.quantity * line.unitPrice);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
