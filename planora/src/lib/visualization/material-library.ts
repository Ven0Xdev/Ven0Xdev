/**
 * ספריית חומרים.
 *
 * חומר אמיתי אינו צבע שטוח. לעץ יש סיב, לשיש יש עורקים, לבטון יש מרקם,
 * ולקרמיקה יש פוגות. הספרייה הזו מתארת חומרים במונחים פיזיקליים (PBR) —
 * מה שמאפשר לרנדרר לייצר מרקם במקום להסתפק בגוון.
 *
 * **הספרייה מתארת מראה, לא מוצר.** מוצר שהדייר יכול לבחור חייב להגיע
 * מקטלוג הספקים ולהיות מאושר לפרויקט; הספרייה רק אומרת איך לרנדר אותו.
 */

import type { MaterialFamily } from "@prisma/client";

export type { MaterialFamily };

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

/** דגם המרקם שהרנדרר מייצר. אין כאן קובצי תמונה — הכול נוצר בזמן ריצה. */
export type TexturePattern =
  | "WOOD_GRAIN"
  | "MARBLE_VEIN"
  | "CONCRETE"
  | "TILE"
  | "TERRAZZO"
  | "WEAVE"
  | "PLASTER"
  | "BRUSHED_METAL"
  | "NONE";

export interface ProceduralTexture {
  pattern: TexturePattern;
  /** כמה מטרים מכסה חזרה אחת של המרקם */
  scaleM: number;
  /** עוצמת הניגוד בין הגוונים, 0..1 */
  contrast: number;
  /** גוון משני — עורקים, סיב, שבבים */
  accentColor?: string;
  /** צבע פוגה, לחומרים מרוצפים */
  groutColor?: string;
}

export interface PbrMaterial {
  family: MaterialFamily;
  baseColor: string;
  roughness: number;
  metalness: number;
  /** שקיפות — לזכוכית בלבד */
  opacity?: number;
  texture?: ProceduralTexture;
  /** עוצמת מפת הנורמל, 0..2 */
  normalStrength?: number;
  /** כמה החומר מחזיר את סביבתו. שיש ומתכת גבוה, טיח נמוך. */
  envIntensity?: number;
  /** שכבת לכה עליונה — חזיתות מטבח מבריקות, קרמיקה מזוגגת */
  clearcoat?: number;
  /** אור עצמי — לגופי תאורה בלבד */
  emissive?: string;
  emissiveIntensity?: number;
}

// ---------------------------------------------------------------------------
// ברירות מחדל לפי משפחה
// ---------------------------------------------------------------------------

/**
 * מה מאפיין כל משפחת חומר.
 * משמש כאשר ידוע לאיזו משפחה שייך מוצר, אך לא כל פרטי המראה שלו.
 */
export const FAMILY_DEFAULTS: Record<MaterialFamily, Omit<PbrMaterial, "family" | "baseColor">> = {
  WOOD: {
    roughness: 0.52,
    metalness: 0,
    texture: { pattern: "WOOD_GRAIN", scaleM: 1.2, contrast: 0.32, accentColor: "#8a5f38" },
    normalStrength: 0.75,
    envIntensity: 0.45,
    clearcoat: 0.15,
  },
  MARBLE: {
    roughness: 0.14,
    metalness: 0.02,
    texture: { pattern: "MARBLE_VEIN", scaleM: 2.4, contrast: 0.26, accentColor: "#9aa1ab" },
    normalStrength: 0.18,
    envIntensity: 1.1,
    clearcoat: 0.35,
  },
  STONE: {
    roughness: 0.78,
    metalness: 0.02,
    texture: { pattern: "TERRAZZO", scaleM: 0.9, contrast: 0.3, accentColor: "#8d8579" },
    normalStrength: 0.9,
    envIntensity: 0.55,
  },
  CONCRETE: {
    roughness: 0.82,
    metalness: 0.02,
    texture: { pattern: "CONCRETE", scaleM: 1.6, contrast: 0.2, accentColor: "#8f8f8c" },
    normalStrength: 0.6,
    envIntensity: 0.4,
  },
  GLASS: {
    roughness: 0.05,
    metalness: 0,
    // כמעט שקופה — מה שנראה דרכה הוא הנוף, לא הזכוכית
    opacity: 0.13,
    envIntensity: 1.8,
    normalStrength: 0,
  },
  METAL: {
    roughness: 0.32,
    metalness: 0.92,
    texture: { pattern: "BRUSHED_METAL", scaleM: 0.5, contrast: 0.12 },
    normalStrength: 0.3,
    envIntensity: 1.4,
  },
  FABRIC: {
    roughness: 0.94,
    metalness: 0,
    texture: { pattern: "WEAVE", scaleM: 0.25, contrast: 0.16 },
    normalStrength: 0.8,
    envIntensity: 0.3,
  },
  PAINT: {
    roughness: 0.93,
    metalness: 0,
    texture: { pattern: "PLASTER", scaleM: 2.2, contrast: 0.05 },
    normalStrength: 0.3,
    envIntensity: 0.28,
  },
  CERAMIC: {
    roughness: 0.22,
    metalness: 0.02,
    texture: { pattern: "TILE", scaleM: 0.6, contrast: 0.12, groutColor: "#d6d2ca" },
    normalStrength: 0.45,
    envIntensity: 0.75,
    clearcoat: 0.4,
  },
  OUTDOOR: {
    roughness: 0.88,
    metalness: 0.02,
    texture: { pattern: "TILE", scaleM: 0.75, contrast: 0.2, groutColor: "#9a9287" },
    normalStrength: 0.85,
    envIntensity: 0.55,
  },
};

// ---------------------------------------------------------------------------
// מפרט הסטנדרט
// ---------------------------------------------------------------------------

/**
 * החומרים שהדירה מגיעה איתם כשאין בחירה.
 * זהו מפרט הסטנדרט של הפרויקט, לא "עיצוב" שהמערכת המציאה.
 */
export const STANDARD_SURFACES: Record<MaterialSurface, PbrMaterial> = {
  interiorFloor: {
    family: "CERAMIC",
    baseColor: "#d8d2c7",
    ...FAMILY_DEFAULTS.CERAMIC,
    texture: { pattern: "TILE", scaleM: 0.6, contrast: 0.1, groutColor: "#c8c2b7" },
  },
  outdoorFloor: {
    family: "OUTDOOR",
    baseColor: "#a89c8c",
    ...FAMILY_DEFAULTS.OUTDOOR,
  },
  // הקירות בהירים במכוון, כדי שהריצוף והמטבח יהיו הצבע הדומיננטי בחלל
  wall: {
    family: "PAINT",
    baseColor: "#f1f0ed",
    ...FAMILY_DEFAULTS.PAINT,
  },
  partition: {
    family: "PAINT",
    baseColor: "#eae8e4",
    ...FAMILY_DEFAULTS.PAINT,
  },
  railing: {
    family: "METAL",
    baseColor: "#9aa3ad",
    ...FAMILY_DEFAULTS.METAL,
    roughness: 0.38,
    metalness: 0.75,
  },
  kitchenFront: {
    family: "WOOD",
    baseColor: "#e6e2db",
    ...FAMILY_DEFAULTS.WOOD,
    roughness: 0.42,
    texture: { pattern: "WOOD_GRAIN", scaleM: 0.9, contrast: 0.1, accentColor: "#d3cec4" },
    clearcoat: 0.45,
  },
  countertop: {
    family: "MARBLE",
    baseColor: "#3f4750",
    ...FAMILY_DEFAULTS.MARBLE,
    texture: { pattern: "MARBLE_VEIN", scaleM: 1.6, contrast: 0.22, accentColor: "#7d8794" },
  },
  doorLeaf: {
    family: "WOOD",
    baseColor: "#e7e3dc",
    ...FAMILY_DEFAULTS.WOOD,
    texture: { pattern: "WOOD_GRAIN", scaleM: 1.1, contrast: 0.08, accentColor: "#d6d0c5" },
  },
  windowFrame: {
    family: "GLASS",
    baseColor: "#dceaf2",
    ...FAMILY_DEFAULTS.GLASS,
  },
  sanitary: {
    family: "CERAMIC",
    baseColor: "#fbfbfa",
    ...FAMILY_DEFAULTS.CERAMIC,
    texture: undefined,
    roughness: 0.16,
    clearcoat: 0.6,
  },
};

// ---------------------------------------------------------------------------
// ערכות מראה
// ---------------------------------------------------------------------------

/**
 * ערכות מראה לדירה.
 *
 * ערכה אינה מוצר. היא רשימת מק"טים מהקטלוג של הפרויקט — ואם מק"ט אינו זמין
 * לדירה, הוא פשוט אינו נכנס לערכה. אין כאן "מטבח מומלץ" שהמערכת המציאה.
 */
export interface MaterialPreset {
  id: "LIGHT" | "WARM" | "DARK";
  label: string;
  description: string;
  /** מק"טים מקטלוג הפרויקט */
  skus: string[];
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "LIGHT",
    label: "בהיר",
    description: "גוונים בהירים, חלל פתוח ומואר.",
    skus: ["NV-CLASSIC", "CS-OAK-190", "AQ-TAP-CHROME"],
  },
  {
    id: "WARM",
    label: "חם",
    description: "גווני עץ חמים עם משטח כהה.",
    skus: ["NV-CLASSIC", "CS-OAK-190", "AQ-TAP-BLACK"],
  },
  {
    id: "DARK",
    label: "כהה",
    description: "חזיתות גרפיט, בטון ופרטי מתכת שחורים.",
    skus: ["NV-URBAN", "CS-CONCRETE-120", "AQ-TAP-BLACK"],
  },
];

// ---------------------------------------------------------------------------
// זיהוי משפחה מתיאור המוצר
// ---------------------------------------------------------------------------

const FAMILY_HINTS: [RegExp, MaterialFamily][] = [
  [/שיש|קוורץ|אבן קיסר|marble|quartz/i, "MARBLE"],
  [/בטון|concrete/i, "CONCRETE"],
  [/אלון|עץ|אגוז|oak|walnut|wood/i, "WOOD"],
  [/קרמי|פורצלן|גרניט פורצלן|ceramic|porcelain/i, "CERAMIC"],
  [/נירוסטה|כרום|פליז|שחור מט|metal|chrome|brass/i, "METAL"],
  [/זכוכית|glass/i, "GLASS"],
  [/בד|טקסטיל|fabric/i, "FABRIC"],
  [/אבן טבעית|טרצו|stone|terrazzo/i, "STONE"],
];

/**
 * מנחש את משפחת החומר מתיאור המוצר, כאשר הספק לא הגדיר אותה.
 *
 * זו הערכה לצורכי **תצוגה בלבד**. היא אינה משנה את המפרט, את המחיר ואת מה
 * שייבנה בפועל, וכאשר הספק הגדיר משפחה — היא גוברת.
 */
export function inferMaterialFamily(label: string, fallback: MaterialFamily = "PAINT"): MaterialFamily {
  for (const [pattern, family] of FAMILY_HINTS) {
    if (pattern.test(label)) return family;
  }
  return fallback;
}
