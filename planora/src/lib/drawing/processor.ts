/**
 * הפשטת מעבד השרטוטים.
 *
 * המערכת לא מכירה DWG, RVT או IFC. היא מכירה `DrawingProcessor`.
 * ב-V1 פעיל `DemoDrawingProcessor`. בעתיד ניתן להחליף מימוש ללא שינוי במסכים.
 */

import type {
  DetectedChange,
  DrawingDocument,
  DrawingElement,
  DrawingPreview,
  ProcessFileInput,
  ProcessedDrawing,
} from "./types";

export interface DrawingProcessor {
  /** מזהה המימוש — נשמר ב-AIAnalysis לצורכי ביקורת */
  readonly engine: string;
  readonly engineVersion: string;

  /** סוגי קבצים שהמימוש יודע לקרוא */
  readonly supportedExtensions: string[];

  processFile(input: ProcessFileInput): Promise<ProcessedDrawing>;

  extractElements(document: DrawingDocument): Promise<DrawingElement[]>;

  comparePlans(base: DrawingDocument, target: DrawingDocument): Promise<DetectedChange[]>;

  generatePreview(document: DrawingDocument): Promise<DrawingPreview>;
}

export class UnsupportedDrawingFormatError extends Error {
  constructor(extension: string) {
    super(`פורמט הקובץ ${extension} אינו נתמך על ידי המעבד הנוכחי`);
    this.name = "UnsupportedDrawingFormatError";
  }
}
