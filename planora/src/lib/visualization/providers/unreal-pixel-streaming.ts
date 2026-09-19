/**
 * מנוע עתידי — הדמיה אדריכלית פוטוריאליסטית ב-Pixel Streaming.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * המימוש הזה אינו קיים עדיין. הקובץ מגדיר את החוזה ואת דרך ההטמעה, כדי
 * שהמעבר אליו יהיה החלפת מחרוזת אחת בקובץ סביבה — ולא כתיבה מחדש של הפורטל.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## מה הוא אמור לתת
 *
 * רמת luxury real-estate: חומרים מציאותיים (PBR מלא, Nanite), תאורה גלובלית
 * (Lumen), השתקפויות, זכוכית אמיתית, תאורה פנימית, סביבה חיצונית אמיתית עם
 * נוף וקו רקיע, מעבר יום/שקיעה/לילה, מרפסת ופנטהאוז, ותנועת מצלמה קולנועית.
 *
 * ## למה זרימת וידאו ולא הורדת המנוע לדפדפן
 *
 * סצנה ברמה הזו שוקלת גיגה-בייטים ודורשת GPU. היא תרוץ על שרת רינדור, ותזרים
 * וידאו ל-WebRTC. הדפדפן מציג משטח וידאו ושולח פקודות — זה מה שמבדיל את
 * `REMOTE_STREAM` מ-`LOCAL_SCENE` ב-`VisualizationPresentation`.
 *
 * ## ארכיטקטורה נדרשת
 *
 * 1. **צד שרת** — Unreal Engine עם תוסף Pixel Streaming, מאחורי Signalling
 *    Server ו-TURN. מופע לכל צופה, עם תפוגת זמן; דירה גדולה מדי לרינדור
 *    משותף בין דיירים.
 * 2. **הקצאת מופע** — נקודת קצה בצד ה-Next.js שמבקשת מופע, מאמתת שלמשתמש יש
 *    גישה לדירה (אותה בדיקה כמו בכל מסך: `requireTenantApartment` /
 *    `requireApartmentAccess`), ומחזירה `sessionId`, `signalingUrl` ואסימון
 *    קצר-מועד. אסור להחזיר כתובת שרת רינדור ללא בדיקת הרשאה — זרם וידאו של
 *    דירה הוא מידע אישי של הדייר.
 * 3. **נכסים** — לכל `ApartmentType` נכס Unreal מוכן. `LoadApartmentInput`
 *    מעביר `apartmentTypeId` בדיוק בשביל זה. הגאומטריה חייבת להיגזר מאותה
 *    תוכנית מאושרת, אחרת התלת-ממד והתוכנית ייצאו מסנכרון — וזה בדיוק הכשל
 *    שהמערכת נועדה למנוע.
 * 4. **חומרים** — `MaterialAssignment` נשלח כפקודה למופע. `textureUrl` מצביע
 *    על טקסטורת הספק; המנוע העתידי כן יטען אותה, בשונה מהאב-טיפוס.
 * 5. **פקודות** — כל מתודה בממשק מתורגמת להודעת JSON לערוץ הנתונים של
 *    Pixel Streaming, והמצב מתעדכן כשהמופע מאשר. לכן כל המתודות מחזירות
 *    `Promise` ומשדרות למאזינים.
 *
 * ## מה לא משתנה כשעוברים
 *
 * הפורטל, מסכי המנהל, מודל הנתונים ומנוע התמחור. המסך מבדיל בין שני המנועים
 * בנקודה אחת: `presentation.kind`.
 *
 * ## סיכונים שיש להכריע בהם לפני פיתוח
 *
 * - עלות GPU לצופה ומדיניות תפוגה
 * - השהיה מקצה לקצה ברשת סלולרית של דייר
 * - נגישות: זרם וידאו אינו DOM. חובה להשאיר חלופה נגישה — המפרט הכתוב
 *   והתוכנית הדו-ממדית — ולא להישען על התצוגה בלבד.
 * - אזור אירוח: נתוני פרויקט אינם יוצאים לשירות חיצוני ללא החלטה מפורשת.
 */

import type { ApartmentVisualizationProvider } from "../provider";
import {
  VisualizationUnsupportedError,
  type ApplyMaterialInput,
  type ApplyProductVariantInput,
  type ExteriorEnvironment,
  type LoadApartmentInput,
  type LoadConfigurationInput,
  type TimeOfDay,
  type VisualizationCapabilities,
  type VisualizationListener,
  type VisualizationProviderId,
  type VisualizationState,
  type WalkthroughOptions,
} from "../types";

/** היכולות שהמנוע הזה אמור לספק כשיוטמע */
export const UNREAL_CAPABILITIES: VisualizationCapabilities = {
  photorealistic: true,
  globalIllumination: true,
  reflections: true,
  realisticGlass: true,
  cinematicCamera: true,
  interiorLighting: true,
  exteriorEnvironment: true,
  walkthrough: true,
  balconyVisualization: true,
  supplierDrivenMaterials: true,
  runsInBrowser: false,
  requiresStreaming: true,
};

const NOT_IMPLEMENTED =
  "מנוע ההדמיה הפוטוריאליסטי אינו מחובר בסביבה זו. התצוגה הזמינה היא תצוגת האב-טיפוס.";

/**
 * שלד בלבד. כל פעולה נכשלת במפורש, ולא מחזירה מצב שנראה תקין.
 *
 * זו החלטה מכוונת: מנוע שמחזיר בשקט סצנה ריקה היה מציג לדייר דירה שאינה שלו.
 */
export class UnrealPixelStreamingProvider implements ApartmentVisualizationProvider {
  readonly id: VisualizationProviderId = "unreal-pixel-streaming";
  readonly label = "הדמיה פוטוריאליסטית (Unreal Pixel Streaming)";
  readonly capabilities = UNREAL_CAPABILITIES;

  private state: VisualizationState = {
    status: "UNSUPPORTED",
    apartmentId: null,
    timeOfDay: "MIDDAY",
    environment: null,
    focusedRoomId: null,
    cameraMode: "ORBIT",
    rooms: [],
    presentation: null,
    message: NOT_IMPLEMENTED,
  };

  private listeners = new Set<VisualizationListener>();

  private unsupported(): never {
    throw new VisualizationUnsupportedError(NOT_IMPLEMENTED);
  }

  async loadApartment(_input: LoadApartmentInput): Promise<VisualizationState> {
    this.unsupported();
  }

  async loadConfiguration(_input: LoadConfigurationInput): Promise<VisualizationState> {
    this.unsupported();
  }

  async applyMaterial(_input: ApplyMaterialInput): Promise<VisualizationState> {
    this.unsupported();
  }

  async applyProductVariant(_input: ApplyProductVariantInput): Promise<VisualizationState> {
    this.unsupported();
  }

  async setTimeOfDay(_timeOfDay: TimeOfDay): Promise<VisualizationState> {
    this.unsupported();
  }

  async setExteriorEnvironment(
    _environment: ExteriorEnvironment | null,
  ): Promise<VisualizationState> {
    this.unsupported();
  }

  async focusRoom(_roomId: string | null): Promise<VisualizationState> {
    this.unsupported();
  }

  async startWalkthrough(_options?: WalkthroughOptions): Promise<VisualizationState> {
    this.unsupported();
  }

  async stopWalkthrough(): Promise<VisualizationState> {
    this.unsupported();
  }

  getState(): VisualizationState {
    return this.state;
  }

  subscribe(listener: VisualizationListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }
}
