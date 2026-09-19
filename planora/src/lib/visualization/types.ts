/**
 * טיפוסי שכבת ההדמיה.
 *
 * כל מה שמוגדר כאן אינו תלוי במנוע תלת-ממד מסוים. המסכים מדברים בשפה הזו
 * בלבד, כך שניתן יהיה להחליף בעתיד את מנוע ההדמיה — למשל למנוע פוטוריאליסטי
 * מבוסס Unreal Engine — בלי לגעת בפורטל הדיירים או בממשק המקצועי.
 */

import type { SupplierCategory, ViewType } from "@prisma/client";
import type { ApartmentGeometry } from "@/lib/geometry/types";

// ---------------------------------------------------------------------------
// זהות המנוע ויכולותיו
// ---------------------------------------------------------------------------

export type VisualizationProviderId = "r3f-webgl" | "unreal-pixel-streaming";

/**
 * יכולות המנוע.
 *
 * הממשק נשען על הדגלים האלה במקום להניח מה המנוע יודע לעשות. כך מנוע
 * פוטוריאליסטי מקבל את הפקדים שמתאימים לו, ומנוע האב-טיפוס אינו מציג
 * שליטה בדבר שאינו יודע לרנדר.
 */
export interface VisualizationCapabilities {
  /** רינדור פוטוריאליסטי ברמת הדמיה אדריכלית */
  photorealistic: boolean;
  globalIllumination: boolean;
  reflections: boolean;
  realisticGlass: boolean;
  /** תנועת מצלמה קולנועית בין נקודות עניין */
  cinematicCamera: boolean;
  interiorLighting: boolean;
  /** סביבה חיצונית — נוף, קו רקיע, מזג אוויר */
  exteriorEnvironment: boolean;
  walkthrough: boolean;
  /** הדמיית מרפסת ופנטהאוז */
  balconyVisualization: boolean;
  /** החלפת חומרים לפי מוצרי ספק */
  supplierDrivenMaterials: boolean;
  /** רץ בדפדפן עצמו, בלי תשתית רינדור מרוחקת */
  runsInBrowser: boolean;
  /** דורש זרימת וידאו משרת רינדור */
  requiresStreaming: boolean;
}

// ---------------------------------------------------------------------------
// קלט
// ---------------------------------------------------------------------------

export type TimeOfDay = "MORNING" | "MIDDAY" | "SUNSET" | "NIGHT";

export interface ExteriorEnvironment {
  /** סוג הנוף, כפי שנשמר ב-ApartmentViewProfile */
  viewType: ViewType;
  /** גובה הקומה במטרים — משפיע על קו האופק */
  floorHeightM?: number | null;
  /** אזימוט במעלות: 0 = צפון */
  orientation?: number | null;
  balconyDirection?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface LoadApartmentInput {
  apartmentId: string;
  /**
   * גאומטריית הדירה המנורמלת — המקור היחיד לצורה.
   * היא נגזרת מהתוכנית שהקבלן העלה, ולא נבנית בתצוגה.
   */
  geometry: ApartmentGeometry;
  /** מזהה טיפוס הדירה, לשימוש מנוע שטוען נכס מוכן לכל טיפוס */
  apartmentTypeId?: string | null;
  planVersionId?: string | null;
  environment?: ExteriorEnvironment | null;
}

/** חומר שמקורו במוצר אמיתי שאושר לפרויקט */
export interface MaterialAssignment {
  /** המשטח שעליו מוחל החומר */
  surface: MaterialSurface;
  color: string;
  roughness: number;
  metalness: number;
  /** כתובת טקסטורה, כאשר המנוע תומך בכך */
  textureUrl?: string | null;
  /** שם המוצר שממנו נגזר החומר — להצגה בממשק */
  sourceLabel: string;
  productId?: string | null;
  variantId?: string | null;
}

/**
 * המשטחים שהתצורה יכולה להחליף.
 * מכוון במפורש לחלקים שניתן לייצג נאמנה — לא לכל אובייקט בסצנה.
 */
export type MaterialSurface =
  | "interiorFloor"
  | "outdoorFloor"
  | "wall"
  | "partition"
  | "railing"
  | "kitchenFront"
  | "countertop"
  | "doorLeaf"
  | "windowFrame"
  | "sanitary";

export interface LoadConfigurationInput {
  configurationId?: string | null;
  /** החומרים שנגזרים מהבחירות של הדייר */
  materials: MaterialAssignment[];
  /** הקטגוריות שנבחרו — לשימוש בהדגשה ובמיקוד */
  selectedCategories?: SupplierCategory[];
}

export interface ApplyMaterialInput {
  surface: MaterialSurface;
  material: Omit<MaterialAssignment, "surface"> | null;
}

export interface ApplyProductVariantInput {
  productId: string;
  variantId: string | null;
  /** החומרים של הווריאנט, כפי שנשמרו ב-MaterialDefinition */
  materials: MaterialAssignment[];
}

export interface WalkthroughOptions {
  /** נקודת פתיחה. ללא ערך — מרכז הדירה. */
  startRoomId?: string | null;
  /** מסלול בין חדרים, לשימוש מצלמה קולנועית */
  path?: string[];
  loop?: boolean;
}

// ---------------------------------------------------------------------------
// מצב
// ---------------------------------------------------------------------------

export type VisualizationStatus = "IDLE" | "LOADING" | "READY" | "ERROR" | "UNSUPPORTED";

/**
 * רמת איכות הרינדור.
 *
 * `AUTO` נקבעת לפי המכשיר. הדייר אינו אמור לדעת מה זה SSAO — הוא רואה
 * "איכות גבוהה" או "ביצועים", והמערכת בוחרת ברירת מחדל שמתאימה למכשיר שלו.
 */
export type QualityMode = "HIGH" | "BALANCED" | "PERFORMANCE" | "AUTO";

export type CameraMode = "ORBIT" | "WALK";

export interface VisualizationRoom {
  id: string;
  label: string;
  areaSqm: number;
}

/**
 * אופן ההצגה בפועל.
 *
 * `LOCAL_SCENE` — המנוע מספק מודל שהדפדפן מרנדר בעצמו.
 * `REMOTE_STREAM` — המנוע מרנדר בשרת ומזרים וידאו; הדפדפן מציג משטח וידאו
 * ושולח פקודות. הממשק מבדיל בין השניים בנקודה אחת בלבד.
 */
export type VisualizationPresentation =
  | {
      kind: "LOCAL_SCENE";
      /** המודל שהרנדרר המקומי יודע לצייר. הטיפוס שקוף לשאר המערכת. */
      scene: unknown;
      materials: Record<MaterialSurface, ResolvedMaterial>;
      lighting: SceneLightingDescriptor;
    }
  | {
      kind: "REMOTE_STREAM";
      sessionId: string;
      signalingUrl: string;
      /** מזהה ה-peer בצד שרת הרינדור */
      streamId?: string;
    };

export interface ResolvedMaterial {
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
  textureUrl?: string | null;
  sourceLabel?: string;
}

export interface SceneLightingDescriptor {
  skyColor: string;
  groundColor: string;
  ambientIntensity: number;
  sunIntensity: number;
  sunColor: string;
  sunPosition: [number, number, number];
  interiorIntensity: number;
  background: string;
}

export interface VisualizationState {
  status: VisualizationStatus;
  apartmentId: string | null;
  timeOfDay: TimeOfDay;
  qualityMode: QualityMode;
  /** רמת האיכות שנבחרה בפועל כאשר `qualityMode` הוא `AUTO` */
  effectiveQuality: Exclude<QualityMode, "AUTO">;
  environment: ExteriorEnvironment | null;
  focusedRoomId: string | null;
  cameraMode: CameraMode;
  rooms: VisualizationRoom[];
  presentation: VisualizationPresentation | null;
  /** הודעה בעברית להצגה למשתמש כאשר משהו אינו זמין */
  message: string | null;
}

export type VisualizationListener = (state: VisualizationState) => void;

export class VisualizationUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualizationUnsupportedError";
  }
}
