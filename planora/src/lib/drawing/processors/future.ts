/**
 * חתימות למימושים עתידיים.
 *
 * אין כאן מימוש — המחלקות קיימות כדי לקבע את החוזה מול הספקים העתידיים
 * ולוודא שהמערכת אינה תלויה במעבד מסוים. אין להפעיל אותן ב-V1.
 */

import { DrawingProcessor } from "../processor";
import type {
  DetectedChange,
  DrawingDocument,
  DrawingElement,
  DrawingPreview,
  ProcessFileInput,
  ProcessedDrawing,
} from "../types";

const NOT_IMPLEMENTED = "המימוש הזה יתווסף בשלב מאוחר יותר";

abstract class PlannedProcessor implements DrawingProcessor {
  abstract readonly engine: string;
  abstract readonly engineVersion: string;
  abstract readonly supportedExtensions: string[];

  async processFile(_input: ProcessFileInput): Promise<ProcessedDrawing> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async extractElements(_document: DrawingDocument): Promise<DrawingElement[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async comparePlans(
    _base: DrawingDocument,
    _target: DrawingDocument,
  ): Promise<DetectedChange[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async generatePreview(_document: DrawingDocument): Promise<DrawingPreview> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

/** Autodesk Platform Services — Model Derivative / Viewer */
export class AutodeskDrawingProcessor extends PlannedProcessor {
  readonly engine = "autodesk-aps";
  readonly engineVersion = "0.0.0";
  readonly supportedExtensions = ["dwg", "rvt", "nwd"];
}

export class IfcDrawingProcessor extends PlannedProcessor {
  readonly engine = "ifc";
  readonly engineVersion = "0.0.0";
  readonly supportedExtensions = ["ifc"];
}

export class RevitDrawingProcessor extends PlannedProcessor {
  readonly engine = "revit-automation";
  readonly engineVersion = "0.0.0";
  readonly supportedExtensions = ["rvt"];
}
