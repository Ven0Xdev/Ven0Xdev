/**
 * חתימות למודולים עתידיים מבוססי AI.
 *
 * אין כאן מימוש. המחלקות קיימות כדי לקבע את החוזה ולוודא שהמערכת אינה
 * תלויה בהם. העיקרון נשמר: AI אינו מאשר תקן, אינו מאשר הנדסה, אינו מאשר
 * לביצוע, ואינו מחליף יועץ או מנהלת שינויי דיירים.
 */

import type { SupplierCategory } from "@prisma/client";
import type { DrawingDocument } from "@/lib/drawing/types";

export interface DesignSuggestion {
  productId: string;
  category: SupplierCategory;
  rationale: string;
  /** ציון פנימי בלבד — אינו מוצג כהמלצה מקצועית */
  score: number;
}

export interface AIDesignAssistant {
  readonly engine: string;
  suggest(input: {
    apartmentId: string;
    selectedProductIds: string[];
  }): Promise<DesignSuggestion[]>;
}

export interface LayoutRecommendation {
  description: string;
  affectedElementIds: string[];
  requiresProfessionalReview: true;
}

export interface LayoutRecommendationEngine {
  readonly engine: string;
  analyze(document: DrawingDocument): Promise<LayoutRecommendation[]>;
}

export interface GeneratedView {
  imageUrl: string;
  disclaimer: string;
}

export interface ViewGenerationService {
  readonly engine: string;
  generate(input: {
    apartmentId: string;
    timeOfDay: string;
  }): Promise<GeneratedView>;
}

const NOT_IMPLEMENTED = "המודול הזה יתווסף בגרסה עתידית";

export class UnavailableDesignAssistant implements AIDesignAssistant {
  readonly engine = "unavailable";
  async suggest(): Promise<DesignSuggestion[]> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

export class UnavailableLayoutEngine implements LayoutRecommendationEngine {
  readonly engine = "unavailable";
  async analyze(): Promise<LayoutRecommendation[]> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

export class UnavailableViewGenerationService implements ViewGenerationService {
  readonly engine = "unavailable";
  async generate(): Promise<GeneratedView> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
