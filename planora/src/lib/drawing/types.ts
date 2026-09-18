/**
 * מודל נתוני שרטוט פנימי.
 *
 * זהו הפורמט היחיד שהמערכת מכירה. כל מעבד שרטוטים (Demo, Autodesk, IFC, Revit)
 * מתרגם את הקובץ המקורי למודל הזה. רכיבי התצוגה לא מכירים DWG, PDF או RVT —
 * הם מכירים אך ורק `DrawingDocument`.
 *
 * יחידות: סנטימטרים. ציר X ימינה, ציר Y מטה (תואם SVG).
 */

import type { ChangeCategoryKey } from "@prisma/client";

export const ELEMENT_TYPES = [
  "ROOM",
  "WALL",
  "PARTITION",
  "RAILING",
  "DOOR",
  "WINDOW",
  "SLIDING_DOOR",
  "OUTLET",
  "SWITCH",
  "LIGHT",
  "WATER_POINT",
  "DRAIN",
  "SANITARY",
  "KITCHEN_UNIT",
  "HVAC",
  "COMMUNICATION",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

/** מין דקדוקי — נדרש לניסוח תקין בעברית ("התווסף שקע" מול "התווספה מחיצה") */
export type Gender = "m" | "f";

export interface ElementMetadata {
  /** תווית בעברית להצגה, למשל "אסלה" */
  label?: string;
  gender?: Gender;
  /** החדר שאליו משויך האלמנט */
  room?: string;
  /** תג הנדסי מהתוכנית, למשל "W15" */
  tag?: string;
  /** קיר נושא / אלמנט קונסטרוקטיבי */
  structural?: boolean;
  material?: string;
  /** אורך במטרים — עבור קירות ומחיצות */
  lengthM?: number;
  /** עקיפה ידנית של רמת הוודאות בזיהוי, 0..1 */
  detectionConfidence?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface DrawingElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  metadata: ElementMetadata;
}

export interface DrawingBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface DrawingDocument {
  id: string;
  name: string;
  /** יחידות המידה של הקואורדינטות */
  units: "CM";
  scale: number;
  bounds: DrawingBounds;
  elements: DrawingElement[];
}

/** תוצאת עיבוד קובץ על ידי DrawingProcessor */
export interface ProcessedDrawing {
  document: DrawingDocument;
  /** מטא-דאטה שחולצה מהקובץ המקורי (שכבות, יחידות, שמות גיליונות) */
  sourceMetadata: Record<string, unknown>;
  warnings: string[];
}

export interface DrawingPreview {
  /** SVG מוכן להטמעה, ללא מידע עסקי */
  svg: string;
  width: number;
  height: number;
}

/** שינוי גולמי שזוהה על ידי המעבד — עדיין לא החלטה מקצועית */
export interface DetectedChange {
  elementId: string;
  elementType: ElementType;
  type: "ADDED" | "REMOVED" | "MOVED" | "MODIFIED" | "UNKNOWN";
  categoryKey: ChangeCategoryKey;
  /** רמת ודאות בזיהוי בלבד. אינה אישור מקצועי. */
  confidence: number;
  roomLabel?: string;
  /** תיאור בעברית מוכן להצגה */
  description: string;
  quantity: number;
  unit: string;
  before?: DrawingElement;
  after?: DrawingElement;
  /** מרחק ההזזה בסנטימטרים, כאשר רלוונטי */
  distanceCm?: number;
}

export interface ProcessFileInput {
  fileName: string;
  mimeType?: string;
  /** תוכן הקובץ. ב-V1 מעבד ההדגמה מקבל מסמך מוכן. */
  content?: Buffer | DrawingDocument;
}

/** מיפוי סוג אלמנט לקטגוריית שינוי עסקית */
export const ELEMENT_CATEGORY: Record<ElementType, ChangeCategoryKey> = {
  ROOM: "OTHER",
  WALL: "WALL",
  PARTITION: "WALL",
  RAILING: "WALL",
  DOOR: "DOOR",
  WINDOW: "WINDOW",
  SLIDING_DOOR: "WINDOW",
  OUTLET: "ELECTRICAL",
  SWITCH: "ELECTRICAL",
  LIGHT: "LIGHTING",
  WATER_POINT: "PLUMBING",
  DRAIN: "PLUMBING",
  SANITARY: "SANITARY",
  KITCHEN_UNIT: "KITCHEN",
  HVAC: "HVAC",
  COMMUNICATION: "COMMUNICATION",
};

/** תווית ברירת מחדל בעברית לכל סוג אלמנט */
export const ELEMENT_LABELS: Record<ElementType, { label: string; gender: Gender }> = {
  ROOM: { label: "חלל", gender: "m" },
  WALL: { label: "קיר", gender: "m" },
  PARTITION: { label: "מחיצה", gender: "f" },
  RAILING: { label: "מעקה", gender: "m" },
  DOOR: { label: "דלת", gender: "f" },
  WINDOW: { label: "חלון", gender: "m" },
  SLIDING_DOOR: { label: "דלת הזזה", gender: "f" },
  OUTLET: { label: "שקע", gender: "m" },
  SWITCH: { label: "מפסק", gender: "m" },
  LIGHT: { label: "נקודת תאורה", gender: "f" },
  WATER_POINT: { label: "נקודת מים", gender: "f" },
  DRAIN: { label: "נקודת ביוב", gender: "f" },
  SANITARY: { label: "קבועה סניטרית", gender: "f" },
  KITCHEN_UNIT: { label: "ארון מטבח", gender: "m" },
  HVAC: { label: "מפזר מיזוג", gender: "m" },
  COMMUNICATION: { label: "נקודת תקשורת", gender: "f" },
};

/** יחידת מדידה לכל סוג אלמנט */
export const ELEMENT_UNIT: Record<ElementType, string> = {
  ROOM: "SQM",
  WALL: "METER",
  PARTITION: "METER",
  RAILING: "METER",
  DOOR: "UNIT",
  WINDOW: "UNIT",
  SLIDING_DOOR: "UNIT",
  OUTLET: "UNIT",
  SWITCH: "UNIT",
  LIGHT: "POINT",
  WATER_POINT: "POINT",
  DRAIN: "POINT",
  SANITARY: "UNIT",
  KITCHEN_UNIT: "UNIT",
  HVAC: "UNIT",
  COMMUNICATION: "POINT",
};

/** סוגי אלמנטים שנספרים בהשוואת כמויות */
export const COUNTABLE_ELEMENTS: ElementType[] = [
  "OUTLET",
  "SWITCH",
  "LIGHT",
  "WATER_POINT",
  "DRAIN",
  "SANITARY",
  "HVAC",
  "COMMUNICATION",
  "DOOR",
  "WINDOW",
  "SLIDING_DOOR",
];

/** סוגי אלמנטים שנמדדים באורך */
export const MEASURED_ELEMENTS: ElementType[] = ["WALL", "PARTITION"];
