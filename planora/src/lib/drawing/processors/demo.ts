/**
 * DemoDrawingProcessor — המימוש הפעיל ב-V1.
 *
 * הוא עובד ישירות על מודל הנתונים הפנימי. עבור קבצי DWG/DXF/RVT/IFC הוא
 * שומר מטא-דאטה בלבד ומסמן שנדרשת הפקה של מודל אלמנטים — אין כאן ניסיון
 * לפענח פורמט קנייני.
 */

import { comparePlans } from "../compare";
import { viewBoxOf } from "../geometry";
import { DrawingProcessor } from "../processor";
import type {
  DetectedChange,
  DrawingDocument,
  DrawingElement,
  DrawingPreview,
  ProcessFileInput,
  ProcessedDrawing,
} from "../types";

const METADATA_ONLY_EXTENSIONS = ["dwg", "dxf", "rvt", "ifc"];

export class DemoDrawingProcessor implements DrawingProcessor {
  readonly engine = "planora-demo";
  readonly engineVersion = "1.0.0";
  readonly supportedExtensions = ["pdf", ...METADATA_ONLY_EXTENSIONS];

  async processFile(input: ProcessFileInput): Promise<ProcessedDrawing> {
    const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
    const warnings: string[] = [];

    if (METADATA_ONLY_EXTENSIONS.includes(extension)) {
      warnings.push(
        "הקובץ נשמר עם המטא-דאטה שלו. הפקת מודל אלמנטים מהקובץ תתאפשר בגרסה עתידית.",
      );
    }

    if (input.content && typeof input.content === "object" && "elements" in input.content) {
      return {
        document: input.content,
        sourceMetadata: { extension, elementCount: input.content.elements.length },
        warnings,
      };
    }

    throw new Error("מעבד ההדגמה מקבל מסמך שרטוט מוכן בלבד");
  }

  async extractElements(document: DrawingDocument): Promise<DrawingElement[]> {
    return document.elements;
  }

  async comparePlans(
    base: DrawingDocument,
    target: DrawingDocument,
  ): Promise<DetectedChange[]> {
    return comparePlans(base, target);
  }

  async generatePreview(document: DrawingDocument): Promise<DrawingPreview> {
    const shapes = document.elements
      .filter((element) => ["WALL", "PARTITION", "RAILING"].includes(element.type))
      .map(
        (element) =>
          `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="#2c3542" />`,
      )
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxOf(document.bounds)}" role="img" aria-label="${document.name}">${shapes}</svg>`;

    return { svg, width: document.bounds.width, height: document.bounds.height };
  }
}

export const demoDrawingProcessor = new DemoDrawingProcessor();
