/**
 * מנוע המלצות — מבוסס כללים בלבד.
 *
 * המערכת אינה ממציאה עיצוב ואינה מחליפה מעצבת. היא מציעה מוצרים משלימים
 * שכבר אושרו לפרויקט, לפי קשרים שהוגדרו מראש. כל המלצה מסבירה את עצמה.
 */

import type { SupplierCategory } from "@prisma/client";

export interface RecommendationCandidate {
  productId: string;
  name: string;
  category: SupplierCategory;
  price: number;
  imageUrl: string | null;
  /** האם המוצר זמין לדירה הזו — מוצר שאינו זמין לעולם לא יומלץ */
  selectable: boolean;
}

export interface RecommendationLink {
  sourceProductId: string;
  targetProductId: string;
  reason: string;
  sortOrder: number;
}

export interface Recommendation {
  productId: string;
  name: string;
  category: SupplierCategory;
  price: number;
  imageUrl: string | null;
  reason: string;
}

/**
 * מחזיר המלצות למוצרים שנבחרו, ללא כפילויות וללא מוצרים שכבר נבחרו.
 * מוצר שאינו זמין לדירה מסוננת החוצה — גם אם הוגדר לו קשר.
 */
export function recommendForSelections(input: {
  selectedProductIds: string[];
  links: RecommendationLink[];
  candidates: RecommendationCandidate[];
  limit?: number;
}): Recommendation[] {
  const selected = new Set(input.selectedProductIds);
  const candidateById = new Map(input.candidates.map((item) => [item.productId, item]));
  const seen = new Set<string>();
  const results: Recommendation[] = [];

  const relevant = input.links
    .filter((link) => selected.has(link.sourceProductId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const link of relevant) {
    if (selected.has(link.targetProductId)) continue;
    if (seen.has(link.targetProductId)) continue;

    const candidate = candidateById.get(link.targetProductId);
    if (!candidate || !candidate.selectable) continue;

    seen.add(link.targetProductId);
    results.push({
      productId: candidate.productId,
      name: candidate.name,
      category: candidate.category,
      price: candidate.price,
      imageUrl: candidate.imageUrl,
      reason: link.reason,
    });

    if (input.limit && results.length >= input.limit) break;
  }

  return results;
}
