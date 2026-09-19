/**
 * חוזה מעבד הגאומטריה.
 *
 * הקבלן מעלה תוכנית; המערכת צריכה לגזור ממנה דירה תלת-ממדית. הפורמטים שונים
 * מאוד זה מזה — DWG אינו RVT, ו-PDF אינו IFC — ולכן לכל פורמט יהיה מעבד משלו,
 * וכולם מחזירים את אותו `ApartmentGeometry`.
 *
 * **כרגע קיים מעבד אחד בלבד: `DemoGeometryProvider`.** אין Parsing אמיתי של
 * DWG, DXF, PDF, RVT או IFC, והמערכת אינה מתיימרת שיש.
 */

import type {
  ApartmentGeometry,
  BalconyGeometry,
  CeilingGeometry,
  FloorGeometry,
  GeometrySource,
  GeometrySourceFormat,
  GeometryValidationIssue,
  OpeningGeometry,
  RoomGeometry,
  WallGeometry,
} from "./types";
import type { DrawingDocument } from "@/lib/drawing/types";

export type GeometryProviderId =
  | "demo"
  | "autodesk"
  | "ifc"
  | "pdf-plan"
  | "dxf";

export interface LoadFromPlanInput {
  /** מודל השרטוט המנורמל — תוצר של `DrawingProcessor` */
  document: DrawingDocument;
  apartmentId?: string | null;
  apartmentTypeId?: string | null;
  projectId?: string | null;
  planId?: string | null;
  planVersionId?: string | null;
  createdBy?: string | null;
}

export interface LoadFromBimInput {
  /** תוכן הקובץ. מעבד BIM עובד על הקובץ עצמו, לא על שרטוט מעובד. */
  content: Buffer | ArrayBuffer;
  fileName: string;
  format: GeometrySourceFormat;
  apartmentId?: string | null;
  apartmentTypeId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
}

/**
 * יצירת גאומטריה לדירה מתוך גאומטריית טיפוס.
 *
 * כאן חוסכים את הבנייה מאפס: בפרויקט עם 40 דירות ו-6 טיפוסים נבנות 6
 * גאומטריות בסיס, וכל דירה מקבלת מהן עותק עם הנתונים שלה.
 */
export interface GenerateGeometryInput {
  base: ApartmentGeometry;
  apartmentId: string;
  /** עקיפה לדירה חריגה — פנטהאוז, דירת גן, דופלקס */
  override?: Partial<Pick<ApartmentGeometry, "rooms" | "walls" | "openings" | "balconies">>;
  createdBy?: string | null;
  note?: string | null;
}

/** שינוי מאושר שמשנה את הגאומטריה */
export interface ApprovedGeometryChange {
  changeItemId: string;
  /** מה השינוי עושה למודל */
  operation: "MOVE_WALL" | "REMOVE_WALL" | "ADD_WALL" | "MOVE_OPENING" | "RESIZE_ROOM";
  targetId: string;
  /** הזזה במטרים */
  deltaX?: number;
  deltaZ?: number;
  wall?: WallGeometry;
  opening?: OpeningGeometry;
}

export interface CreateGeometryVersionInput {
  source?: GeometrySource;
  createdBy?: string | null;
  appliedChangeIds?: string[];
  isOverride?: boolean;
  note?: string | null;
}

export interface ApartmentGeometryProvider {
  readonly id: GeometryProviderId;
  readonly label: string;
  /** הפורמטים שהמעבד הזה באמת יודע לקרוא */
  readonly supportedFormats: GeometrySourceFormat[];

  /** מתוכנית מעובדת (`DrawingDocument`) */
  loadFromPlan(input: LoadFromPlanInput): Promise<ApartmentGeometry>;

  /** מקובץ BIM — Revit, IFC */
  loadFromBIM(input: LoadFromBimInput): Promise<ApartmentGeometry>;

  /** מגאומטריית טיפוס לדירה מסוימת */
  generateGeometry(input: GenerateGeometryInput): Promise<ApartmentGeometry>;

  getRooms(geometry: ApartmentGeometry): RoomGeometry[];
  getWalls(geometry: ApartmentGeometry): WallGeometry[];
  getOpenings(geometry: ApartmentGeometry): OpeningGeometry[];
  getDoors(geometry: ApartmentGeometry): OpeningGeometry[];
  getWindows(geometry: ApartmentGeometry): OpeningGeometry[];
  getBalconies(geometry: ApartmentGeometry): BalconyGeometry[];
  getFloors(geometry: ApartmentGeometry): FloorGeometry[];
  getCeilings(geometry: ApartmentGeometry): CeilingGeometry[];

  /**
   * מחיל שינויים **שאושרו מקצועית** על הגאומטריה.
   * שינוי שלא אושר אינו מגיע לכאן: הדייר אינו מזיז קירות.
   */
  applyApprovedChanges(
    geometry: ApartmentGeometry,
    changes: ApprovedGeometryChange[],
  ): ApartmentGeometry;

  createGeometryVersion(
    geometry: ApartmentGeometry,
    input: CreateGeometryVersionInput,
  ): ApartmentGeometry;

  /** מסמן ממצאים. אינו מאשר ואינו פוסל — אדם מוסמך מחליט. */
  validateGeometry(geometry: ApartmentGeometry): GeometryValidationIssue[];
}

// ---------------------------------------------------------------------------
// בחירת המעבד
// ---------------------------------------------------------------------------

/**
 * מחזיר את המעבד המתאים לפורמט.
 *
 * כל עוד אין מעבד אמיתי, כל הפורמטים מגיעים למעבד ההדגמה — והוא אומר במפורש
 * מה הוא לא יודע לקרוא, במקום להחזיר דירה שהומצאה.
 */
export async function createGeometryProvider(
  format: GeometrySourceFormat = "DEMO",
): Promise<ApartmentGeometryProvider> {
  const { DemoGeometryProvider } = await import("./providers/demo");
  const provider = new DemoGeometryProvider();

  if (!provider.supportedFormats.includes(format)) {
    // אין כאן נפילה: המעבד עצמו יסרב לקרוא קובץ שאינו יודע לפענח.
    return provider;
  }

  return provider;
}
