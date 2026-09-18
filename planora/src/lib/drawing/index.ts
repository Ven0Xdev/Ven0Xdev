import { demoDrawingProcessor } from "./processors/demo";
import type { DrawingProcessor } from "./processor";

/**
 * בחירת מעבד השרטוטים הפעיל.
 * החלפת מנוע נעשית כאן בלבד — שאר המערכת אינה מודעת למימוש.
 */
export function getDrawingProcessor(): DrawingProcessor {
  return demoDrawingProcessor;
}

export * from "./types";
export * from "./geometry";
export * from "./compare";
export type { DrawingProcessor } from "./processor";
