/**
 * הפשטת מקור קטלוג הספק.
 *
 * ב-V2 הקטלוג מנוהל בתוך OVIAX (ידנית או בייבוא CSV). ההפשטה קיימת כדי
 * שבעתיד יהיה אפשר למשוך מוצרים ישירות מ-API של ספק, בלי לשנות את המסכים
 * או את מנוע התמחור.
 */

import type { SupplierCategory } from "@prisma/client";

export interface ExternalProduct {
  sku: string;
  name: string;
  description?: string;
  category: SupplierCategory;
  basePrice: number;
  imageUrl?: string;
  variants?: {
    name: string;
    optionType: string;
    sku?: string;
    priceDelta: number;
    imageUrl?: string;
  }[];
  metadata?: Record<string, unknown>;
}

export interface SupplierCatalogProvider {
  readonly name: string;
  /** משיכת קטלוג מלא מהספק */
  fetchCatalog(input: { supplierId: string; catalogRef?: string }): Promise<ExternalProduct[]>;
  /** עדכון מחירים בלבד */
  fetchPrices(input: { supplierId: string; skus: string[] }): Promise<Record<string, number>>;
}

const NOT_IMPLEMENTED = "משיכת קטלוג מ-API של ספק תתאפשר בגרסה עתידית";

/** מימוש עתידי — קיים כדי לקבע את החוזה בלבד */
export class ApiSupplierCatalogProvider implements SupplierCatalogProvider {
  readonly name = "supplier-api";

  async fetchCatalog(): Promise<ExternalProduct[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async fetchPrices(): Promise<Record<string, number>> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
