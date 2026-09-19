/**
 * זיהוי יכולת המכשיר.
 *
 * הדייר פותח את הדירה שלו מהטלפון באוטובוס, מהמחשב בעבודה ומהטאבלט בערב.
 * החוויה צריכה להיות טובה בכל אחד מהם — ולכן המערכת מודדת את המכשיר במקום
 * להניח, ומעדיפה תצוגה חלקה על פני אפקט נוסף.
 */

import type { QualityMode } from "./types";

export type ResolvedQuality = Exclude<QualityMode, "AUTO">;

export interface QualitySettings {
  /** יחס פיקסלים מרבי לרינדור */
  maxDpr: number;
  shadows: boolean;
  shadowMapSize: number;
  /** רזולוציית טקסטורה מרבית */
  maxTextureSize: number;
  postProcessing: boolean;
  ambientOcclusion: boolean;
  contactShadows: boolean;
  reflections: boolean;
  /**
   * מספר אורות מקומיים מרבי.
   * מעבר לתקרה הזו הצללת החומרים מפסיקה להתקמפל בחלק מהמכשירים,
   * והתוצאה אינה סצנה מוארת פחות אלא סצנה שחורה.
   */
  maxLocalLights: number;
}

export const QUALITY_SETTINGS: Record<ResolvedQuality, QualitySettings> = {
  HIGH: {
    maxDpr: 2,
    shadows: true,
    shadowMapSize: 2048,
    maxTextureSize: 2048,
    postProcessing: true,
    ambientOcclusion: true,
    contactShadows: true,
    reflections: true,
    maxLocalLights: 8,
  },
  BALANCED: {
    maxDpr: 1.6,
    shadows: true,
    shadowMapSize: 1024,
    maxTextureSize: 1024,
    postProcessing: true,
    ambientOcclusion: false,
    contactShadows: true,
    reflections: false,
    maxLocalLights: 8,
  },
  PERFORMANCE: {
    maxDpr: 1.25,
    shadows: false,
    shadowMapSize: 512,
    maxTextureSize: 512,
    postProcessing: false,
    ambientOcclusion: false,
    contactShadows: false,
    reflections: false,
    maxLocalLights: 3,
  },
};

export const QUALITY_LABELS: Record<ResolvedQuality, string> = {
  HIGH: "איכות גבוהה",
  BALANCED: "מאוזן",
  PERFORMANCE: "ביצועים",
};

/** האם הדפדפן יודע לרנדר WebGL בכלל */
export function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    return Boolean(context);
  } catch {
    return false;
  }
}

/**
 * בוחר רמת איכות לפי המכשיר.
 *
 * המדידה גסה בכוונה: אין דרך אמינה לזהות GPU בדפדפן, ועדיף להתחיל נמוך
 * ולהיראות טוב מאשר להתחיל גבוה ולקרטע.
 */
export function detectQualityMode(): ResolvedQuality {
  if (typeof window === "undefined") return "BALANCED";

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const isCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shortestSide = Math.min(window.screen?.width ?? 1280, window.screen?.height ?? 800);

  // טלפון: מסך קטן ומגע
  if (isCoarsePointer && shortestSide <= 500) {
    return cores >= 8 && memory >= 6 ? "BALANCED" : "PERFORMANCE";
  }

  if (cores <= 4 || memory <= 4) return "BALANCED";
  if (cores >= 8 && memory >= 8) return "HIGH";
  return "BALANCED";
}

export function resolveQuality(mode: QualityMode): ResolvedQuality {
  return mode === "AUTO" ? detectQualityMode() : mode;
}
