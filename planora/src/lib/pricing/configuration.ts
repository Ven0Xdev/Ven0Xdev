/**
 * תמחור תצורת הדירה.
 *
 * המנוע מחשב שלושה מקורות יחד: שדרוגי מוצרים שהדייר בחר, חבילות שדרוג,
 * ושינויים מקצועיים שתומחרו בגיליון התמחור. הדייר רואה פירוט לפי קטגוריה —
 * ולעולם לא את המודל המסחרי הפנימי.
 */

import type { SelectionStatus, SupplierCategory } from "@prisma/client";
import { computeTotals, type PricingTotals } from "./engine";

export interface SelectionLine {
  id: string;
  category: SupplierCategory;
  productName: string;
  variantName: string | null;
  quantity: number;
  /** מחיר השדרוג ליחידה, כפי שנשמר ברגע הבחירה */
  price: number;
  status: SelectionStatus;
}

export interface ProfessionalChangeLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** סטטוסים שנכללים בחישוב המחיר שמוצג לדייר */
export const BILLABLE_SELECTION_STATUSES: SelectionStatus[] = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PRICED",
  "PAID",
];

/** בחירה בטיוטה נספרת בהערכה בלבד, ומסומנת ככזו בממשק */
export function isBillable(status: SelectionStatus): boolean {
  return BILLABLE_SELECTION_STATUSES.includes(status);
}

export function selectionLineTotal(line: SelectionLine): number {
  return Math.round(line.price * line.quantity * 100) / 100;
}

export interface CategoryBreakdownRow {
  category: SupplierCategory;
  total: number;
  itemCount: number;
}

export interface ConfigurationPricing {
  /** כולל טיוטות — מה שהדייר רואה בזמן אמת בזמן הבחירה */
  estimatedSelectionsTotal: number;
  /** רק בחירות שנשלחו ומעלה */
  committedSelectionsTotal: number;
  professionalChangesTotal: number;
  byCategory: CategoryBreakdownRow[];
  totals: PricingTotals;
  draftCount: number;
}

/**
 * מחשב את תמונת המחיר המלאה של הדירה.
 * ההנחה והמע"מ מחושבים על הסכום המחייב בתוספת השינויים המקצועיים.
 */
export function computeConfigurationPricing(input: {
  selections: SelectionLine[];
  professionalChanges?: ProfessionalChangeLine[];
  discount?: number;
  vatRate?: number;
  /** האם לכלול טיוטות בסכום המחייב (תצוגת "הערכה" לדייר) */
  includeDrafts?: boolean;
}): ConfigurationPricing {
  const professionalChanges = input.professionalChanges ?? [];

  const estimatedSelectionsTotal = round(
    input.selections.reduce((sum, line) => sum + selectionLineTotal(line), 0),
  );

  const committed = input.selections.filter((line) => isBillable(line.status));
  const committedSelectionsTotal = round(
    committed.reduce((sum, line) => sum + selectionLineTotal(line), 0),
  );

  const professionalChangesTotal = round(
    professionalChanges.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );

  const countedSelections = input.includeDrafts ? input.selections : committed;

  const byCategoryMap = new Map<SupplierCategory, CategoryBreakdownRow>();
  for (const line of countedSelections) {
    const row = byCategoryMap.get(line.category) ?? {
      category: line.category,
      total: 0,
      itemCount: 0,
    };
    row.total = round(row.total + selectionLineTotal(line));
    row.itemCount += 1;
    byCategoryMap.set(line.category, row);
  }

  const pricingLines = [
    ...countedSelections.map((line) => ({ quantity: line.quantity, unitPrice: line.price })),
    ...professionalChanges.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  ];

  return {
    estimatedSelectionsTotal,
    committedSelectionsTotal,
    professionalChangesTotal,
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.total - a.total),
    totals: computeTotals(pricingLines, {
      discount: input.discount,
      vatRate: input.vatRate,
    }),
    draftCount: input.selections.filter((line) => line.status === "DRAFT").length,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
