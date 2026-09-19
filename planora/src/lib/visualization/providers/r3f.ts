/**
 * המנוע הפעיל — React Three Fiber בתוך הדפדפן.
 *
 * הוא מרנדר את הדירה מתוך **גאומטריה מנורמלת** שנגזרה מהתוכנית שהקבלן העלה,
 * עם חומרים שמגיעים ממוצרים שאושרו לפרויקט.
 *
 * מה שהמנוע הזה עדיין לא עושה — ומדווח על כך ב-`capabilities`: תאורה גלובלית
 * ומצלמה קולנועית. מסך שנשען על היכולות האלה יקבל אותן מ-
 * `UnrealPixelStreamingProvider` בעתיד, בלי שינוי בקוד המסך.
 */

import {
  CEILING_HEIGHT_M,
  DOLLHOUSE_CUT_M,
  buildSceneModel,
  type SceneModel,
} from "@/lib/three/scene-model";
import { SCENE_LIGHTING } from "../lighting";
import { resolveSurfaces } from "../resolve";
import { QUALITY_SETTINGS, resolveQuality, type ResolvedQuality } from "../quality";
import type { ApartmentGeometry, RoomKind } from "@/lib/geometry/types";
import type { ApartmentVisualizationProvider } from "../provider";
import type {
  ApplyMaterialInput,
  ApplyProductVariantInput,
  ExteriorEnvironment,
  LoadApartmentInput,
  LoadConfigurationInput,
  MaterialAssignment,
  MaterialSurface,
  QualityMode,
  ResolvedMaterial,
  TimeOfDay,
  VisualizationCapabilities,
  VisualizationListener,
  VisualizationProviderId,
  VisualizationState,
  WalkthroughOptions,
} from "../types";

const R3F_CAPABILITIES: VisualizationCapabilities = {
  photorealistic: false,
  globalIllumination: false,
  reflections: false,
  realisticGlass: false,
  // אין מסלולי מצלמה מתוסרטים ואין עומק שדה — אבל יש מעבר חלק לחדר
  // וסיור מודרך, ולכן שתי היכולות האלה מדווחות בנפרד.
  cinematicCamera: false,
  roomNavigation: true,
  guidedTour: true,
  interiorLighting: true,
  exteriorEnvironment: false,
  walkthrough: true,
  balconyVisualization: true,
  supplierDrivenMaterials: true,
  runsInBrowser: true,
  requiresStreaming: false,
};

/**
 * סדר החדרים בסיור המודרך.
 * מתחיל בסלון ונגמר במרפסת — הסדר שבו אדם מראה את הדירה שלו למישהו.
 */
const TOUR_ORDER: RoomKind[] = [
  "LIVING",
  "KITCHEN",
  "DINING",
  "BEDROOM",
  "BATHROOM",
  "BALCONY",
];

function suggestTour(geometry: ApartmentGeometry): string[] {
  const path: string[] = [];

  for (const kind of TOUR_ORDER) {
    // חדר אחד מכל סוג — הגדול שבהם. סיור שעובר בשלושה חדרי שינה מייגע.
    const room = geometry.rooms
      .filter((candidate) => candidate.kind === kind)
      .sort((a, b) => b.areaSqm - a.areaSqm)[0];
    if (room) path.push(room.id);
  }

  return path;
}

function emptyState(quality: ResolvedQuality): VisualizationState {
  return {
    status: "IDLE",
    apartmentId: null,
    timeOfDay: "MIDDAY",
    qualityMode: "AUTO",
    effectiveQuality: quality,
    environment: null,
    focusedRoomId: null,
    cameraMode: "ORBIT",
    rooms: [],
    tourPath: [],
    suggestedTour: [],
    presentation: null,
    message: null,
  };
}

export class R3FVisualizationProvider implements ApartmentVisualizationProvider {
  readonly id: VisualizationProviderId = "r3f-webgl";
  readonly label = "תצוגה בדפדפן (WebGL)";
  readonly capabilities = R3F_CAPABILITIES;

  private state: VisualizationState = emptyState(resolveQuality("AUTO"));
  private listeners = new Set<VisualizationListener>();
  private geometry: ApartmentGeometry | null = null;
  private scene: SceneModel | null = null;
  /** החומרים הפעילים, לפי משטח. משטח שאינו כאן מקבל את חומר הסטנדרט. */
  private assignments = new Map<MaterialSurface, MaterialAssignment>();
  private disposed = false;

  async loadApartment(input: LoadApartmentInput): Promise<VisualizationState> {
    this.assertLive();

    // פונקציה טהורה וזולה; אין כאן קריאת רשת ואין טעינת נכסים חיצוניים.
    this.geometry = input.geometry;
    this.scene = buildSceneModel(input.geometry, DOLLHOUSE_CUT_M);
    this.assignments.clear();

    this.state = {
      ...this.state,
      status: "READY",
      apartmentId: input.apartmentId,
      environment: input.environment ?? null,
      focusedRoomId: null,
      cameraMode: "ORBIT",
      rooms: this.scene.rooms.map((room) => ({
        id: room.id,
        label: room.label,
        areaSqm: room.area,
        isOutdoor: room.isOutdoor,
      })),
      tourPath: [],
      suggestedTour: suggestTour(input.geometry),
      message: null,
    };

    return this.render();
  }

  async loadConfiguration(input: LoadConfigurationInput): Promise<VisualizationState> {
    this.assertLive();
    this.assignments.clear();
    for (const material of input.materials) {
      this.assignments.set(material.surface, material);
    }
    return this.render();
  }

  async applyMaterial(input: ApplyMaterialInput): Promise<VisualizationState> {
    this.assertLive();
    if (input.material === null) {
      this.assignments.delete(input.surface);
    } else {
      this.assignments.set(input.surface, { ...input.material, surface: input.surface });
    }
    return this.render();
  }

  async applyProductVariant(input: ApplyProductVariantInput): Promise<VisualizationState> {
    this.assertLive();
    // וריאנט אחד עשוי לגעת בכמה משטחים — למשל חזיתות מטבח ומשטח עבודה יחד.
    for (const material of input.materials) {
      this.assignments.set(material.surface, {
        ...material,
        productId: material.productId ?? input.productId,
        variantId: material.variantId ?? input.variantId,
      });
    }
    return this.render();
  }

  async setTimeOfDay(timeOfDay: TimeOfDay): Promise<VisualizationState> {
    this.assertLive();
    this.state = { ...this.state, timeOfDay };
    return this.render();
  }

  async setExteriorEnvironment(
    environment: ExteriorEnvironment | null,
  ): Promise<VisualizationState> {
    this.assertLive();
    // המנוע שומר את הנתון אך אינו מרנדר נוף. ההודעה נועדה כדי שהמסך לא יציג
    // "נוף לים" שאינו נראה בתצוגה.
    this.state = {
      ...this.state,
      environment,
      message: environment
        ? "תצוגת האב-טיפוס ממחישה את הדירה בלבד, ללא הנוף שמסביב לבניין."
        : null,
    };
    return this.render();
  }

  async focusRoom(roomId: string | null): Promise<VisualizationState> {
    this.assertLive();
    if (roomId !== null && !this.state.rooms.some((room) => room.id === roomId)) {
      this.state = { ...this.state, message: "החדר המבוקש אינו קיים בתצוגה." };
      return this.render();
    }
    this.state = { ...this.state, focusedRoomId: roomId, message: null };
    return this.render();
  }

  async startWalkthrough(options?: WalkthroughOptions): Promise<VisualizationState> {
    this.assertLive();

    // במצב סיור הקירות עומדים בגובהם האמיתי. חיתוך "בית בובות" נכון למבט
    // מלמעלה, אבל אדם שהולך בדירה אינו רואה את הקירות נגמרים בגובה החזה.
    if (this.geometry) {
      this.scene = buildSceneModel(this.geometry, CEILING_HEIGHT_M);
    }

    const path = options?.path ?? [];
    this.state = {
      ...this.state,
      cameraMode: "WALK",
      focusedRoomId: options?.startRoomId ?? this.state.focusedRoomId,
      tourPath: path.filter((id) => this.state.rooms.some((room) => room.id === id)),
    };
    return this.render();
  }

  async stopWalkthrough(): Promise<VisualizationState> {
    this.assertLive();
    if (this.geometry) {
      this.scene = buildSceneModel(this.geometry, DOLLHOUSE_CUT_M);
    }
    this.state = { ...this.state, cameraMode: "ORBIT", tourPath: [] };
    return this.render();
  }

  async setQualityMode(mode: QualityMode): Promise<VisualizationState> {
    this.assertLive();
    this.state = { ...this.state, qualityMode: mode, effectiveQuality: resolveQuality(mode) };
    return this.render();
  }

  async resetScene(): Promise<VisualizationState> {
    this.assertLive();
    // חזרה למפרט הסטנדרט ולמבט הפתיחה. הדירה עצמה נשארת טעונה.
    this.assignments.clear();
    if (this.geometry) {
      this.scene = buildSceneModel(this.geometry, DOLLHOUSE_CUT_M);
    }
    this.state = {
      ...this.state,
      timeOfDay: "MIDDAY",
      cameraMode: "ORBIT",
      focusedRoomId: null,
      tourPath: [],
      message: null,
    };
    return this.render();
  }

  /** הגדרות הרינדור לרמת האיכות הפעילה */
  get qualitySettings() {
    return QUALITY_SETTINGS[this.state.effectiveQuality];
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
    // שחרור מפורש: הסצנה, החומרים והמאזינים משוחררים יחד, כדי שמעבר בין
    // מסכים לא ישאיר מודלים בזיכרון.
    this.disposed = true;
    this.listeners.clear();
    this.geometry = null;
    this.scene = null;
    this.assignments.clear();
    this.state = emptyState(this.state.effectiveQuality);
  }

  // -------------------------------------------------------------------------

  private assertLive(): void {
    if (this.disposed) {
      throw new Error("מנוע ההדמיה נסגר. יש ליצור מופע חדש.");
    }
  }

  /** מרכיב את תמונת המצב שהמסך מרנדר, ומשדר אותה למאזינים */
  private render(): VisualizationState {
    if (this.scene) {
      this.state = {
        ...this.state,
        presentation: {
          kind: "LOCAL_SCENE",
          scene: this.scene,
          materials: this.resolveSurfaces(),
          lighting: SCENE_LIGHTING[this.state.timeOfDay],
        },
      };
    }

    for (const listener of this.listeners) {
      listener(this.state);
    }

    return this.state;
  }

  private resolveSurfaces(): Record<MaterialSurface, ResolvedMaterial> {
    return resolveSurfaces([...this.assignments.values()]);
  }
}
