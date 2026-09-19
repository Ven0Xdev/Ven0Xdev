/**
 * הנוף מסביב לדירה.
 *
 * הדירה אינה עומדת בחלל ריק. דייר בקומה 6 מול הים רואה ים, קו רקיע ואופק —
 * וזה חלק ממה שהוא קנה.
 *
 * **הנוף כאן הוא נוף אופייני, לא נוף גיאוגרפי מדויק.** הוא נגזר מסוג הנוף,
 * מגובה הקומה ומכיוון המרפסת, ואינו מתיימר להראות את הבניין שממול. הממשק
 * אומר זאת לדייר במפורש.
 */

import type { ViewType } from "@prisma/client";
import type { TimeOfDay } from "./types";

/** מה מורכב הנוף */
export interface ExteriorPreset {
  /** משטח מים עד האופק */
  water: boolean;
  /** צפיפות קו הרקיע, 0..1 */
  skylineDensity: number;
  /** גובה מבנים אופייני במטרים */
  skylineHeightM: number;
  /** חגורת עצים */
  greenery: number;
  /** כביש וסביבת רחוב מתחת לבניין */
  street: boolean;
  /** רכס הרים באופק */
  hills: boolean;
  /** מרחק הנוף מהבניין */
  distanceM: number;
  label: string;
}

export const EXTERIOR_PRESETS: Record<ViewType, ExteriorPreset> = {
  SEA: {
    water: true,
    skylineDensity: 0.22,
    skylineHeightM: 26,
    greenery: 0.25,
    street: true,
    hills: false,
    distanceM: 150,
    label: "נוף לים",
  },
  CITY: {
    water: false,
    skylineDensity: 1,
    skylineHeightM: 52,
    greenery: 0.2,
    street: true,
    hills: false,
    distanceM: 110,
    label: "נוף עירוני",
  },
  PARK: {
    water: false,
    skylineDensity: 0.28,
    skylineHeightM: 22,
    greenery: 1,
    street: true,
    hills: false,
    distanceM: 120,
    label: "נוף לפארק",
  },
  STREET: {
    water: false,
    skylineDensity: 0.55,
    skylineHeightM: 24,
    greenery: 0.45,
    street: true,
    hills: false,
    distanceM: 80,
    label: "נוף לרחוב",
  },
  MOUNTAIN: {
    water: false,
    skylineDensity: 0.18,
    skylineHeightM: 18,
    greenery: 0.7,
    street: false,
    hills: true,
    distanceM: 220,
    label: "נוף להרים",
  },
  OTHER: {
    water: false,
    skylineDensity: 0.4,
    skylineHeightM: 28,
    greenery: 0.35,
    street: true,
    hills: false,
    distanceM: 120,
    label: "נוף פתוח",
  },
};

/** גוונים של הנוף לפי שעה ביום */
export interface ExteriorPalette {
  /** צבע הזניט — ראש כיפת השמיים */
  zenith: string;
  /** צבע השמיים בגובה האופק */
  horizon: string;
  /** צבע הקרקע מתחת לאופק */
  ground: string;
  water: string;
  /** גוון המבנים הרחוקים — ככל שרחוק יותר, קרוב יותר לצבע האופק */
  buildings: string;
  greenery: string;
  /** חלונות דולקים במבנים */
  windowLight: number;
}

export const EXTERIOR_PALETTES: Record<TimeOfDay, ExteriorPalette> = {
  MORNING: {
    zenith: "#5d92c4",
    horizon: "#dcd0be",
    ground: "#7e8375",
    water: "#48708f",
    buildings: "#b3aca2",
    greenery: "#5c7350",
    windowLight: 0.12,
  },
  MIDDAY: {
    zenith: "#4a86c6",
    horizon: "#cfe0ee",
    ground: "#797f72",
    water: "#3e7ba3",
    buildings: "#b9b4ac",
    greenery: "#55703f",
    windowLight: 0,
  },
  SUNSET: {
    zenith: "#3f5f8e",
    horizon: "#f2a463",
    ground: "#5d5a4d",
    water: "#7a6a72",
    buildings: "#8e7d74",
    greenery: "#4a5439",
    windowLight: 0.55,
  },
  NIGHT: {
    zenith: "#070c18",
    horizon: "#1d2c45",
    ground: "#0c1019",
    water: "#11203a",
    buildings: "#1a2030",
    greenery: "#16201a",
    windowLight: 1,
  },
};

/**
 * הנוף שיוצג בפועל.
 * פרופיל הדירה גובר על ברירת המחדל של הפרויקט; ללא שניהם — נוף פתוח.
 */
export function resolveViewType(
  apartmentViewType?: ViewType | null,
  projectDefault?: ViewType | null,
): ViewType {
  return apartmentViewType ?? projectDefault ?? "OTHER";
}
