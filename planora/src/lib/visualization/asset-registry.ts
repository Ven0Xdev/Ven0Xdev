/**
 * מרשם הנכסים.
 *
 * כל נכס שהתצוגה משתמשת בו — מודל, טקסטורה, מפת סביבה, חומר או פריט ריהוט —
 * מוצהר כאן. **אין כתובת נכס קבורה בתוך רכיב תצוגה.** רכיב מבקש נכס לפי
 * מזהה; המרשם יודע מאיפה הוא מגיע, מי הספק שמאחוריו ומה ההחלפה כשהוא נכשל.
 *
 * מצב היום: רוב הנכסים **פרוצדורליים** — נוצרים בזמן ריצה ואין להם קובץ.
 * נכסי ספק (GLB, טקסטורה) מוצהרים כאן ברגע שהספק מעלה אותם, והמרשם הוא
 * המקום היחיד שצריך לדעת עליהם.
 */

import type { MaterialFamily } from "@prisma/client";

export type AssetKind = "MODEL" | "TEXTURE" | "HDRI" | "MATERIAL" | "FURNITURE";

/** מאיפה הנכס מגיע */
export type AssetOrigin =
  /** נוצר בזמן ריצה — אין קובץ ואין הורדה */
  | "PROCEDURAL"
  /** קובץ שמגיע עם האפליקציה */
  | "BUNDLED"
  /** קובץ שהספק העלה */
  | "SUPPLIER"
  /** חבילת נכסים של פרויקט מסוים */
  | "PROJECT_PACK";

export interface AssetDescriptor {
  id: string;
  kind: AssetKind;
  origin: AssetOrigin;
  /** שם להצגה — של מה הנכס הזה */
  label: string;
  /** כתובת הקובץ. ריק לנכס פרוצדורלי. */
  url?: string | null;
  /** גודל משוער בבתים, לתכנון טעינה */
  bytes?: number | null;
  /** הנכס שיוחלף בו אם הטעינה נכשלה */
  fallbackId?: string | null;
  /** נכס שמגיע ממוצר אמיתי בקטלוג */
  supplierId?: string | null;
  productId?: string | null;
  variantId?: string | null;
  /** משפחת החומר, לנכסי חומר וטקסטורה */
  family?: MaterialFamily | null;
  /** האם לטעון מראש עם פתיחת התצוגה */
  preload?: boolean;
  /** לאיזה פרויקט שייך — `null` = זמין לכל הפרויקטים */
  projectId?: string | null;
}

/**
 * הנכסים שהמערכת מגיעה איתם.
 *
 * כולם פרוצדורליים: אין כאן קובץ אחד להוריד, ולכן התצוגה נפתחת מיידית גם
 * ברשת סלולרית. משפחות החומר מוצהרות כדי שהמרשם יידע מה קיים עוד לפני
 * שספק העלה נכס משלו.
 */
const BUILT_IN_ASSETS: AssetDescriptor[] = [
  {
    id: "material:standard-surfaces",
    kind: "MATERIAL",
    origin: "PROCEDURAL",
    label: "מפרט הסטנדרט של הפרויקט",
    preload: true,
  },
  {
    id: "texture:procedural-library",
    kind: "TEXTURE",
    origin: "PROCEDURAL",
    label: "מרקמים מחושבים — עץ, שיש, בטון, קרמיקה, מתכת, בד, טיח",
    preload: true,
  },
  {
    id: "hdri:computed-environment",
    kind: "HDRI",
    origin: "PROCEDURAL",
    label: "מפת סביבה מחושבת להשתקפויות",
    preload: true,
  },
  {
    id: "furniture:staging-set",
    kind: "FURNITURE",
    origin: "PROCEDURAL",
    label: "ריהוט המחשה — אינו חלק מהביצוע",
    preload: false,
  },
];

class AssetRegistry {
  private assets = new Map<string, AssetDescriptor>();

  constructor(initial: AssetDescriptor[] = []) {
    for (const asset of initial) this.assets.set(asset.id, asset);
  }

  register(asset: AssetDescriptor): void {
    this.assets.set(asset.id, asset);
  }

  registerAll(assets: AssetDescriptor[]): void {
    for (const asset of assets) this.register(asset);
  }

  get(id: string): AssetDescriptor | null {
    return this.assets.get(id) ?? null;
  }

  /**
   * מחזיר את הנכס, ואם אינו קיים — את החלופה שלו.
   * נכס חסר לעולם אינו מפיל את הסצנה; הוא נופל חזרה למשהו שקיים.
   */
  resolve(id: string): AssetDescriptor | null {
    const asset = this.get(id);
    if (asset) return asset;

    // מזהה לא מוכר: אין ניחושים, אין בניית כתובת מהמזהה
    return null;
  }

  fallbackFor(id: string): AssetDescriptor | null {
    const asset = this.get(id);
    if (!asset?.fallbackId) return null;
    return this.get(asset.fallbackId);
  }

  listByKind(kind: AssetKind): AssetDescriptor[] {
    return [...this.assets.values()].filter((asset) => asset.kind === kind);
  }

  /** נכסים שכדאי לטעון מראש — ובלבד שהם שייכים לפרויקט הנוכחי */
  preloadList(projectId?: string | null): AssetDescriptor[] {
    return [...this.assets.values()].filter(
      (asset) =>
        asset.preload && (!asset.projectId || !projectId || asset.projectId === projectId),
    );
  }

  clearSupplierAssets(): void {
    for (const [id, asset] of this.assets) {
      if (asset.origin === "SUPPLIER" || asset.origin === "PROJECT_PACK") {
        this.assets.delete(id);
      }
    }
  }
}

export const assetRegistry = new AssetRegistry(BUILT_IN_ASSETS);

// ---------------------------------------------------------------------------
// נכסי ספקים
// ---------------------------------------------------------------------------

/** השדות של מוצר או וריאנט שיכולים לשאת נכס */
export interface SupplierAssetSource {
  supplierId?: string | null;
  productId: string;
  variantId?: string | null;
  name: string;
  modelUrl?: string | null;
  textureUrl?: string | null;
  family?: MaterialFamily | null;
}

/**
 * מצהיר על נכסי ספק שמגיעים מהקטלוג.
 *
 * מוצר בלי נכס אינו נרשם — אין כאן המצאה של כתובות. המזהה נגזר מהמוצר, כך
 * שאפשר תמיד לענות "מאיזה מוצר הנכס הזה הגיע".
 */
export function registerSupplierAssets(sources: SupplierAssetSource[]): AssetDescriptor[] {
  const registered: AssetDescriptor[] = [];

  for (const source of sources) {
    const suffix = source.variantId ? `${source.productId}:${source.variantId}` : source.productId;

    if (source.modelUrl) {
      const asset: AssetDescriptor = {
        id: `model:${suffix}`,
        kind: "MODEL",
        origin: "SUPPLIER",
        label: source.name,
        url: source.modelUrl,
        supplierId: source.supplierId ?? null,
        productId: source.productId,
        variantId: source.variantId ?? null,
        // מודל ספק שנכשל נופל חזרה לייצוג הפרוצדורלי של אותו חומר
        fallbackId: "material:standard-surfaces",
      };
      assetRegistry.register(asset);
      registered.push(asset);
    }

    if (source.textureUrl) {
      const asset: AssetDescriptor = {
        id: `texture:${suffix}`,
        kind: "TEXTURE",
        origin: "SUPPLIER",
        label: source.name,
        url: source.textureUrl,
        supplierId: source.supplierId ?? null,
        productId: source.productId,
        variantId: source.variantId ?? null,
        family: source.family ?? null,
        fallbackId: "texture:procedural-library",
      };
      assetRegistry.register(asset);
      registered.push(asset);
    }
  }

  return registered;
}

// ---------------------------------------------------------------------------
// יכולות המכשיר
// ---------------------------------------------------------------------------

/** פורמטי טקסטורה דחוסה שהמכשיר יודע לפענח */
export interface TextureSupport {
  astc: boolean;
  etc2: boolean;
  s3tc: boolean;
  /** הסיומת המועדפת לנכסי ספק עתידיים */
  preferred: "astc" | "etc2" | "s3tc" | "none";
}

/**
 * בודק אילו פורמטי דחיסה נתמכים.
 *
 * אין היום נכסי ספק לדחוס, אבל הבדיקה שייכת לכאן: כשיהיו, הבחירה תיעשה
 * במקום אחד ולא בתוך רכיב תצוגה.
 */
export function detectTextureSupport(): TextureSupport {
  const none: TextureSupport = { astc: false, etc2: false, s3tc: false, preferred: "none" };
  if (typeof window === "undefined") return none;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return none;

    const astc = Boolean(gl.getExtension("WEBGL_compressed_texture_astc"));
    const etc2 = Boolean(gl.getExtension("WEBGL_compressed_texture_etc"));
    const s3tc = Boolean(gl.getExtension("WEBGL_compressed_texture_s3tc"));

    return {
      astc,
      etc2,
      s3tc,
      preferred: astc ? "astc" : etc2 ? "etc2" : s3tc ? "s3tc" : "none",
    };
  } catch {
    return none;
  }
}
