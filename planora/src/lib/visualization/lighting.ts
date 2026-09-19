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
    skyColor: "#bcd8ec",
    groundColor: "#736d64",
    ambientIntensity: 0.14,
    sunIntensity: 2.9,
    // שמש נמוכה במזרח, אור חמים וצללים ארוכים
    sunColor: "#ffdfbe",
    sunPosition: [13, 5.2, 8],
    interiorIntensity: 0.12,
    background: "#dceaf6",
    exposure: 0.6,
    envIntensity: 0.34,
    horizonColor: "#f2e4d4",
    cityLights: 0,
    balconyIntensity: 0,
  },
  MIDDAY: {
    skyColor: "#cadff0",
    groundColor: "#7a736a",
    // מילוי נמוך במכוון: אור אחיד מכל הכיוונים משטח את החדר ומלבין חומרים
    ambientIntensity: 0.15,
    sunIntensity: 3.2,
    sunColor: "#fff6e8",
    // לא ישירות מלמעלה — שמש אלכסונית נותנת צללים שמראים עומק
    sunPosition: [9, 12, 6],
    interiorIntensity: 0.08,
    background: "#e6eff7",
    exposure: 0.58,
    envIntensity: 0.36,
    horizonColor: "#dfeaf3",
    cityLights: 0,
    balconyIntensity: 0,
  },
  SUNSET: {
    skyColor: "#f0c9a4",
    groundColor: "#6a5d4e",
    ambientIntensity: 0.1,
    sunIntensity: 2.8,
    // השמש נמוכה מאוד במערב — צללים ארוכים ואור כתום
    sunColor: "#ff9d55",
    sunPosition: [-14, 2.2, 4],
    interiorIntensity: 0.55,
    background: "#f3dcc4",
    exposure: 0.72,
    envIntensity: 0.32,
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
    background: "#0e1420",
    exposure: 1.1,
    envIntensity: 0.3,
    horizonColor: "#2a3450",
    cityLights: 1,
    balconyIntensity: 0.9,
  },
};

/** צבע גוף תאורה פנימי — נורת LED חמה */
export const INTERIOR_LIGHT_COLOR = "#ffd9a8";
/** תאורת מרפסת — חמה יותר ועמומה */
export const BALCONY_LIGHT_COLOR = "#ffc98a";
