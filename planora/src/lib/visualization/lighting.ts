/**
 * תאורת הסצנה לפי שעה ביום.
 *
 * תאורה היא ההבדל הגדול בין "מודל" לבין "דירה". הערכים כאן מתארים אור יום
 * ישראלי: שמש גבוהה וקשה בצהריים, אור חם ונמוך בשקיעה, ובלילה — הדירה
 * נדלקת מבפנים והחוץ מחשיך.
 */

import type { SceneLightingDescriptor, TimeOfDay } from "./types";

export const SCENE_LIGHTING: Record<TimeOfDay, SceneLightingDescriptor> = {
  MORNING: {
    skyColor: "#cfe3f2",
    groundColor: "#d8d2c8",
    ambientIntensity: 0.5,
    sunIntensity: 2.2,
    // שמש נמוכה במזרח, אור צונן-חמים
    sunColor: "#ffe9d2",
    sunPosition: [11, 6.5, 7],
    interiorIntensity: 0.12,
    background: "#e8f1f8",
    exposure: 1,
    envIntensity: 0.85,
    horizonColor: "#f2e4d4",
    cityLights: 0,
    balconyIntensity: 0,
  },
  MIDDAY: {
    skyColor: "#dceaf5",
    groundColor: "#ddd8cf",
    ambientIntensity: 0.62,
    sunIntensity: 3.1,
    sunColor: "#ffffff",
    sunPosition: [4, 15, 4],
    interiorIntensity: 0.08,
    background: "#eef4f9",
    exposure: 0.95,
    envIntensity: 1,
    horizonColor: "#dfeaf3",
    cityLights: 0,
    balconyIntensity: 0,
  },
  SUNSET: {
    skyColor: "#f5d6b8",
    groundColor: "#b9a893",
    ambientIntensity: 0.32,
    sunIntensity: 2.4,
    // השמש נמוכה מאוד במערב — צללים ארוכים ואור כתום
    sunColor: "#ff9d55",
    sunPosition: [-14, 2.2, 4],
    interiorIntensity: 0.55,
    background: "#f6e2d0",
    exposure: 1.12,
    envIntensity: 0.8,
    horizonColor: "#ff9e63",
    cityLights: 0.25,
    balconyIntensity: 0.4,
  },
  NIGHT: {
    skyColor: "#141b29",
    groundColor: "#0d1119",
    ambientIntensity: 0.1,
    // אין שמש; מעט אור ירח קר
    sunIntensity: 0.22,
    sunColor: "#8fa8cf",
    sunPosition: [-7, 9, -7],
    interiorIntensity: 1.35,
    background: "#121724",
    exposure: 1.25,
    envIntensity: 0.35,
    horizonColor: "#2a3450",
    cityLights: 1,
    balconyIntensity: 0.9,
  },
};

/** צבע גוף תאורה פנימי — נורת LED חמה */
export const INTERIOR_LIGHT_COLOR = "#ffd9a8";
/** תאורת מרפסת — חמה יותר ועמומה */
export const BALCONY_LIGHT_COLOR = "#ffc98a";
