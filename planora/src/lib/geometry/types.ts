/**
 * גאומטריה מנורמלת של דירה.
 *
 * זו השכבה שהרנדרר צורך — ורק היא. אף רכיב תצוגה אינו יודע מהו DWG, RVT, IFC
 * או PDF, וכל מעבד קבצים עתידי מתרגם את הקובץ המקורי למבנה הזה.
 *
 * הגאומטריה מתארת **דירה אמיתית**: היא נגזרת מהתוכנית שהקבלן העלה, נושאת את
 * מקור הנתונים ואת מספר הגרסה, ומשתנה רק כאשר שינוי אושר מקצועית.
 *
 * יחידות: **מטרים**. ציר X ימינה, ציר Z קדימה, ציר Y כלפי מעלה.
 * (מודל השרטוט `DrawingDocument` עובד בסנטימטרים ובצירי SVG; ההמרה נעשית
 * במעבד הגאומטריה, לא בתצוגה.)
 */

// ---------------------------------------------------------------------------
// מקור וגרסה
// ---------------------------------------------------------------------------

/**
 * פורמט המקור שממנו נגזרה הגאומטריה.
 * `DEMO` — נתוני הדגמה. שאר הפורמטים דורשים מעבד ייעודי שטרם נכתב.
 */
export type GeometrySourceFormat = "DEMO" | "DWG" | "DXF" | "PDF" | "RVT" | "IFC" | "MANUAL";

export interface GeometrySource {
  format: GeometrySourceFormat;
  /** התוכנית שממנה נגזרה הגאומטריה */
  planId?: string | null;
  planVersionId?: string | null;
  fileName?: string | null;
  /** אזהרות מהמעבד — למשל שכבה שלא זוהתה */
  warnings?: string[];
}

/**
 * גרסת גאומטריה.
 *
 * כל גרסה ניתנת לביקורת: מאיזה קובץ, מי יצר, מתי, ואילו שינויים מאושרים הוחלו.
 * בלי זה אי אפשר לענות על השאלה "למה הדירה בתלת-ממד נראית כך" — וזו שאלה
 * שנשאלת כשיש מחלוקת.
 */
export interface GeometryVersion {
  id: string;
  versionNo: number;
  source: GeometrySource;
  createdAt: string;
  createdBy?: string | null;
  /** מזהי ה-`ChangeItem` המאושרים שהוחלו על גרסת הבסיס */
  appliedChangeIds: string[];
  /** האם הגאומטריה היא עקיפה ייחודית לדירה, ולא טיפוס הבסיס */
  isOverride: boolean;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// יסודות
// ---------------------------------------------------------------------------

/** נקודה במישור הרצפה, במטרים */
export interface Vec2 {
  x: number;
  z: number;
}

export interface GeometryBounds {
  min: Vec2;
  max: Vec2;
  center: Vec2;
  sizeX: number;
  sizeZ: number;
}

export type RoomKind =
  | "LIVING"
  | "KITCHEN"
  | "DINING"
  | "BEDROOM"
  | "BATHROOM"
  | "BALCONY"
  | "CORRIDOR"
  | "STORAGE"
  | "SAFE_ROOM"
  | "OTHER";

// ---------------------------------------------------------------------------
// אלמנטים
// ---------------------------------------------------------------------------

export interface RoomGeometry {
  id: string;
  label: string;
  kind: RoomKind;
  /** מתאר החדר. מלבן הוא ארבע נקודות; מעבד עתידי יחזיר פוליגון חופשי. */
  outline: Vec2[];
  center: Vec2;
  areaSqm: number;
  /** חלל חוץ — מרפסת, גג, גינה */
  isOutdoor: boolean;
  ceilingHeightM: number;
}

export type WallKind = "STRUCTURAL" | "PARTITION" | "RAILING";

export interface WallGeometry {
  id: string;
  kind: WallKind;
  start: Vec2;
  end: Vec2;
  thicknessM: number;
  heightM: number;
  /** קיר נושא — לעולם אינו משתנה מבחירת דייר */
  structural: boolean;
  roomIds: string[];
}

export type OpeningKind = "DOOR" | "WINDOW" | "SLIDING_DOOR";

export interface OpeningGeometry {
  id: string;
  kind: OpeningKind;
  label: string;
  center: Vec2;
  widthM: number;
  depthM: number;
  /** גובה הסף מהרצפה. דלת = 0, חלון = גובה האדן. */
  sillHeightM: number;
  heightM: number;
  rotationRad: number;
  wallId?: string | null;
  roomIds: string[];
}

export interface FloorGeometry {
  id: string;
  roomId: string;
  outline: Vec2[];
  /** מפלס הרצפה. דופלקס יקבל מפלס שני. */
  levelM: number;
  thicknessM: number;
  isOutdoor: boolean;
}

export interface CeilingGeometry {
  id: string;
  roomId: string;
  heightM: number;
  kind: "FLAT" | "DROPPED";
}

export interface BalconyGeometry {
  id: string;
  roomId: string;
  outline: Vec2[];
  railingHeightM: number;
  /** אזימוט במעלות: 0 = צפון. קובע את הנוף ואת כיוון השמש. */
  directionDeg?: number | null;
}

/**
 * קבועות ויחידות שמעוגנות בתוכנית — מטבח וכלים סניטריים.
 *
 * אלה אינם רהיטי Staging: הם חלק מהביצוע, ולכן מגיעים מהתוכנית ולא מהעיצוב.
 */
export type FixtureKind = "KITCHEN_CABINET" | "KITCHEN_COUNTER" | "SANITARY";

export interface FixtureGeometry {
  id: string;
  kind: FixtureKind;
  label: string;
  center: Vec2;
  widthM: number;
  depthM: number;
  heightM: number;
  rotationRad: number;
  roomId?: string | null;
}

// ---------------------------------------------------------------------------
// הדירה
// ---------------------------------------------------------------------------

export interface ApartmentGeometry {
  id: string;
  apartmentId: string | null;
  apartmentTypeId: string | null;
  projectId: string | null;
  version: GeometryVersion;
  bounds: GeometryBounds;
  rooms: RoomGeometry[];
  walls: WallGeometry[];
  openings: OpeningGeometry[];
  floors: FloorGeometry[];
  ceilings: CeilingGeometry[];
  balconies: BalconyGeometry[];
  fixtures: FixtureGeometry[];
}

// ---------------------------------------------------------------------------
// בדיקת תקינות
// ---------------------------------------------------------------------------

export type GeometryIssueCode =
  | "NO_ROOMS"
  | "ROOM_NOT_CLOSED"
  | "WALL_OVERLAP"
  | "OPENING_WITHOUT_WALL"
  | "OPENING_OUTSIDE_BOUNDS"
  | "MISSING_DOOR"
  | "SCALE_MISMATCH"
  | "IMPLAUSIBLE_ROOM_AREA"
  | "IMPLAUSIBLE_CEILING_HEIGHT";

/**
 * ממצא בדיקה — **לא החלטה מקצועית**.
 *
 * המערכת מסמנת ומספרת; אדם מוסמך מחליט. `ERROR` אינו אומר שהתוכנית פסולה,
 * אלא שהגאומטריה שחולצה אינה ניתנת לרינדור אמין.
 */
export interface GeometryValidationIssue {
  code: GeometryIssueCode;
  severity: "ERROR" | "WARNING";
  /** הודעה בעברית, מנוסחת להצגה למשתמש מקצועי */
  message: string;
  elementId?: string | null;
}

export class GeometryUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryUnsupportedError";
  }
}
