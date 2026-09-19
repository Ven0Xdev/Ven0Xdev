/**
 * חוזה מנוע ההדמיה.
 *
 * מנוע התלת-ממד הוא מודול נפרד וניתן להחלפה. המסכים אינם יודעים אם הדירה
 * מרונדרת בדפדפן או בשרת רינדור מרוחק — הם מדברים אך ורק בשפת הממשק הזה.
 *
 * המימוש הפעיל היום הוא אב-טיפוס מבוסס Three.js (`PrototypeVisualizationProvider`).
 * היעד העתידי הוא הדמיה אדריכלית פוטוריאליסטית מבוססת Unreal Engine בזרימת
 * וידאו (`UnrealPixelStreamingProvider`). ההחלפה נעשית בנקודה אחת: הפונקציה
 * `createVisualizationProvider` שבקובץ זה.
 *
 * כלל מנחה: המנוע ממחיש בלבד. אין בהדמיה משום אישור הנדסי, ואין היא מחליפה
 * את המפרט הטכני ואת התוכניות המאושרות.
 */

import type {
  ApplyMaterialInput,
  ApplyProductVariantInput,
  ExteriorEnvironment,
  LoadApartmentInput,
  LoadConfigurationInput,
  TimeOfDay,
  VisualizationCapabilities,
  VisualizationListener,
  VisualizationProviderId,
  VisualizationState,
  WalkthroughOptions,
} from "./types";

/**
 * מנוע הדמיית דירה.
 *
 * כל הפעולות מחזירות את המצב המעודכן, וגם משדרות אותו למאזינים. כך מסך יכול
 * לבחור בין המתנה לתוצאה לבין האזנה רציפה — למשל כאשר המנוע המרוחק מדווח על
 * התקדמות טעינה.
 */
export interface ApartmentVisualizationProvider {
  readonly id: VisualizationProviderId;
  /** שם להצגה בממשק ובתיעוד */
  readonly label: string;
  readonly capabilities: VisualizationCapabilities;

  /** טוען את גאומטריית הדירה. נקודת הפתיחה של כל שאר הפעולות. */
  loadApartment(input: LoadApartmentInput): Promise<VisualizationState>;

  /** מחיל את כל הבחירות של הדייר בבת אחת */
  loadConfiguration(input: LoadConfigurationInput): Promise<VisualizationState>;

  /** מחליף חומר במשטח אחד. `material: null` מחזיר לחומר הסטנדרט. */
  applyMaterial(input: ApplyMaterialInput): Promise<VisualizationState>;

  /** מחיל וריאנט של מוצר — עשוי לגעת בכמה משטחים יחד */
  applyProductVariant(input: ApplyProductVariantInput): Promise<VisualizationState>;

  setTimeOfDay(timeOfDay: TimeOfDay): Promise<VisualizationState>;

  /** מעדכן את הנוף מסביב לדירה: כיוון, גובה קומה, סוג נוף */
  setExteriorEnvironment(environment: ExteriorEnvironment | null): Promise<VisualizationState>;

  /** ממקד את המצלמה בחדר. `null` מחזיר למבט כללי. */
  focusRoom(roomId: string | null): Promise<VisualizationState>;

  /** עובר למצב סיור בתוך הדירה */
  startWalkthrough(options?: WalkthroughOptions): Promise<VisualizationState>;

  /** חוזר ממצב סיור למבט כללי על הדירה */
  stopWalkthrough(): Promise<VisualizationState>;

  getState(): VisualizationState;

  /** מחזיר פונקציית ביטול הרשמה */
  subscribe(listener: VisualizationListener): () => void;

  /** משחרר משאבים. חובה לקרוא כאשר המסך נסגר. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// בחירת המנוע
// ---------------------------------------------------------------------------

/** המנוע שרץ כאשר לא הוגדר אחרת */
export const DEFAULT_VISUALIZATION_PROVIDER_ID: VisualizationProviderId = "prototype-three";

const PROVIDER_IDS: VisualizationProviderId[] = ["prototype-three", "unreal-pixel-streaming"];

export function isVisualizationProviderId(value: unknown): value is VisualizationProviderId {
  return typeof value === "string" && (PROVIDER_IDS as string[]).includes(value);
}

/**
 * המנוע שהסביבה מבקשת.
 *
 * הערך נקרא מ-`NEXT_PUBLIC_VISUALIZATION_PROVIDER`. ערך לא מוכר אינו מפיל את
 * המסך — המערכת חוזרת לאב-טיפוס, כדי שתקלת הגדרה לא תשאיר דייר בלי תצוגה.
 */
export function resolveVisualizationProviderId(): VisualizationProviderId {
  const configured = process.env.NEXT_PUBLIC_VISUALIZATION_PROVIDER;
  return isVisualizationProviderId(configured) ? configured : DEFAULT_VISUALIZATION_PROVIDER_ID;
}

/**
 * יוצר מופע מנוע.
 *
 * מופע לכל מסך: המנוע מחזיק מצב (דירה טעונה, חומרים, שעה ביום), ושני מסכים
 * פתוחים בו-זמנית אינם אמורים לדרוס זה את מצבו של זה.
 *
 * הטעינה דינמית כדי שקוד המנוע — ובמקרה של Three.js, גם ספריית התלת-ממד —
 * לא ייכנס לחבילת הטעינה הראשונית של הדף.
 */
export async function createVisualizationProvider(
  id: VisualizationProviderId = resolveVisualizationProviderId(),
): Promise<ApartmentVisualizationProvider> {
  switch (id) {
    case "unreal-pixel-streaming": {
      const { UnrealPixelStreamingProvider } = await import(
        "./providers/unreal-pixel-streaming"
      );
      return new UnrealPixelStreamingProvider();
    }
    case "prototype-three":
    default: {
      const { PrototypeVisualizationProvider } = await import("./providers/prototype");
      return new PrototypeVisualizationProvider();
    }
  }
}
