/**
 * מרקמים פרוצדורליים.
 *
 * אין כאן קובצי תמונה. המרקמים נוצרים בזמן ריצה על Canvas — סיב עץ, עורקי
 * שיש, מרקם בטון, פוגות בין אריחים, שבבי טרצו, אריגת בד ושריטות מתכת.
 *
 * למה לא תמונות: טקסטורה אמיתית של ספק שוקלת מגה-בייטים, והדייר פותח את
 * הדירה מהטלפון. מרקם מחושב נטען מיידית, מתאים לכל גוון שהדייר בוחר, ואינו
 * מתיימר להיות צילום של המוצר. כשלספק תהיה טקסטורה אמיתית — `textureUrl`
 * יגבר עליו.
 *
 * הקובץ רץ בדפדפן בלבד (`document.createElement`).
 */

import * as THREE from "three";

import type { ProceduralTexture, TexturePattern } from "@/lib/visualization/material-library";

export interface SurfaceTextures {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
}

// ---------------------------------------------------------------------------
// רעש דטרמיניסטי — אותה דירה נראית אותו דבר בכל טעינה
// ---------------------------------------------------------------------------

function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** רעש ערכים עם אינטרפולציה — בסיס לכל המרקמים */
function valueNoise(size: number, cells: number, random: () => number): Float32Array {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let index = 0; index < grid.length; index += 1) grid[index] = random();

  const out = new Float32Array(size * size);
  const step = size / cells;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const gx = x / step;
      const gy = y / step;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      // החלקה קוסינוסית — בלעדיה נראים ריבועים
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);

      const a = grid[y0 * (cells + 1) + x0];
      const b = grid[y0 * (cells + 1) + x0 + 1];
      const c = grid[(y0 + 1) * (cells + 1) + x0];
      const d = grid[(y0 + 1) * (cells + 1) + x0 + 1];

      out[y * size + x] = a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
    }
  }

  return out;
}

/** רעש רב-שכבתי */
function fractalNoise(size: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const cells = Math.max(2, 2 ** (octave + 1));
    const layer = valueNoise(size, cells, makeRandom(seed + octave * 7919));
    for (let index = 0; index < out.length; index += 1) out[index] += layer[index] * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }

  for (let index = 0; index < out.length; index += 1) out[index] /= total;
  return out;
}

// ---------------------------------------------------------------------------
// צבע
// ---------------------------------------------------------------------------

function mix(a: THREE.Color, b: THREE.Color, amount: number): THREE.Color {
  return a.clone().lerp(b, Math.max(0, Math.min(1, amount)));
}

// ---------------------------------------------------------------------------
// ציור המרקמים
// ---------------------------------------------------------------------------

interface PatternResult {
  /** צבע לכל פיקסל */
  color: Uint8ClampedArray;
  /** גובה לכל פיקסל, 0..1 — ממנו נגזרת מפת הנורמל */
  height: Float32Array;
}

function drawPattern(
  pattern: TexturePattern,
  size: number,
  baseColor: string,
  accent: string,
  grout: string,
  contrast: number,
  seed: number,
): PatternResult {
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const base = new THREE.Color(baseColor);
  const accentColor = new THREE.Color(accent);
  const groutColor = new THREE.Color(grout);
  const noise = fractalNoise(size, 5, seed);
  const fine = fractalNoise(size, 3, seed + 104729);

  // הערבוב נעשה במרחב לינארי — כך צבעים מתערבבים כמו אור אמיתי — אבל
  // הטקסטורה נשמרת ב-sRGB. בלי ההמרה חזרה, כל משטח היה מוצג כהה פי שניים.
  const write = (index: number, value: THREE.Color, heightValue: number) => {
    const srgb = value.clone().convertLinearToSRGB();
    color[index * 4] = srgb.r * 255;
    color[index * 4 + 1] = srgb.g * 255;
    color[index * 4 + 2] = srgb.b * 255;
    color[index * 4 + 3] = 255;
    height[index] = heightValue;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const n = noise[index];
      const f = fine[index];

      switch (pattern) {
        case "WOOD_GRAIN": {
          // טבעות שנתיות: גל לאורך הציר עם עיוות מהרעש
          const rings = Math.sin((x / size) * Math.PI * 14 + n * 6) * 0.5 + 0.5;
          const grain = rings * 0.7 + f * 0.3;
          write(index, mix(base, accentColor, grain * contrast), 0.5 + (grain - 0.5) * 0.6);
          break;
        }

        case "MARBLE_VEIN": {
          // עורקים: פס דק שנוצר מהתפלגות חדה סביב ערך הרעש
          const vein = Math.abs(Math.sin((x + y) / size * Math.PI * 3 + n * 9));
          const strength = Math.pow(1 - vein, 14);
          write(index, mix(base, accentColor, strength * contrast * 2.2), 0.5 + strength * 0.1);
          break;
        }

        case "CONCRETE": {
          const blotch = n * 0.65 + f * 0.35;
          write(index, mix(base, accentColor, (blotch - 0.5) * contrast + 0.5 * contrast), 0.5 + (blotch - 0.5) * 0.5);
          break;
        }

        case "TILE": {
          // 4x4 אריחים לכל חזרה, עם פוגה
          const tiles = 4;
          const cell = size / tiles;
          const inX = x % cell;
          const inY = y % cell;
          const groutWidth = Math.max(1.5, size / 220);
          const isGrout = inX < groutWidth || inY < groutWidth;

          if (isGrout) {
            write(index, groutColor, 0.18);
          } else {
            // גוון מעט שונה לכל אריח — כמו ריצוף אמיתי
            const tileIndex = Math.floor(y / cell) * tiles + Math.floor(x / cell);
            const shade = (makeRandom(seed + tileIndex * 131)() - 0.5) * contrast * 0.5;
            write(index, mix(base, accentColor, 0.5 + shade).offsetHSL(0, 0, f * 0.02 - 0.01), 0.75);
          }
          break;
        }

        case "TERRAZZO": {
          const chip = Math.pow(f, 3) * 4;
          write(index, chip > 0.6 ? mix(base, accentColor, contrast * 1.6) : base, 0.5 + (chip > 0.6 ? 0.12 : 0));
          break;
        }

        case "WEAVE": {
          const warp = Math.sin((x / size) * Math.PI * 90) * 0.5 + 0.5;
          const weft = Math.sin((y / size) * Math.PI * 90) * 0.5 + 0.5;
          const woven = Math.max(warp, weft) * 0.7 + n * 0.3;
          write(index, mix(base, accentColor, woven * contrast), 0.4 + woven * 0.5);
          break;
        }

        case "BRUSHED_METAL": {
          const streak = Math.sin((y / size) * Math.PI * 260 + n * 3) * 0.5 + 0.5;
          write(index, mix(base, accentColor, streak * contrast), 0.5 + (streak - 0.5) * 0.2);
          break;
        }

        case "PLASTER":
        default: {
          const grain = n * 0.5 + f * 0.5;
          write(index, mix(base, accentColor, (grain - 0.5) * contrast + 0.5 * contrast * 0.4), 0.5 + (grain - 0.5) * 0.35);
          break;
        }
      }
    }
  }

  return { color, height };
}

/** גוזר מפת נורמל ממפת גובה (Sobel) */
function heightToNormal(height: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));

      const nx = dx * strength;
      const ny = dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const index = (y * size + x) * 4;

      data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      data[index + 3] = 255;
    }
  }

  return data;
}

/** גוזר מפת חספוס ממפת הגובה — שקעים מחזירים פחות אור */
function heightToRoughness(height: Float32Array, size: number, spread: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < height.length; index += 1) {
    const value = Math.max(0, Math.min(1, 0.5 + (0.5 - height[index]) * spread));
    const offset = index * 4;
    data[offset] = value * 255;
    data[offset + 1] = value * 255;
    data[offset + 2] = value * 255;
    data[offset + 3] = 255;
  }
  return data;
}

function toTexture(data: Uint8ClampedArray, size: number, srgb: boolean): THREE.Texture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// מטמון
// ---------------------------------------------------------------------------

const cache = new Map<string, SurfaceTextures>();

export function textureCacheKey(
  texture: ProceduralTexture,
  baseColor: string,
  normalStrength: number,
  size: number,
): string {
  return [
    texture.pattern,
    baseColor,
    texture.accentColor ?? "",
    texture.groutColor ?? "",
    texture.contrast,
    normalStrength,
    size,
  ].join("|");
}

/**
 * מייצר — או מחזיר מהמטמון — את מפות המרקם לחומר.
 * המטמון משותף לכל הסצנה: אותו ריצוף בעשרה חדרים נוצר פעם אחת.
 */
export function getProceduralTextures(
  texture: ProceduralTexture | undefined,
  baseColor: string,
  normalStrength: number,
  size: number,
): SurfaceTextures {
  const empty: SurfaceTextures = { map: null, normalMap: null, roughnessMap: null };
  if (!texture || texture.pattern === "NONE") return empty;

  const key = textureCacheKey(texture, baseColor, normalStrength, size);
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashString(key);
  const { color, height } = drawPattern(
    texture.pattern,
    size,
    baseColor,
    texture.accentColor ?? baseColor,
    texture.groutColor ?? "#cfcac1",
    texture.contrast,
    seed,
  );

  const result: SurfaceTextures = {
    map: toTexture(color, size, true),
    normalMap:
      normalStrength > 0
        ? toTexture(heightToNormal(height, size, normalStrength * 2), size, false)
        : null,
    roughnessMap: toTexture(heightToRoughness(height, size, 0.45), size, false),
  };

  cache.set(key, result);
  return result;
}

/**
 * מייצר מראש את מרקמי מפרט הסטנדרט.
 *
 * הם המרקמים שכל דירה משתמשת בהם, ויצירתם עולה זמן מעבד. הכנה בזמן שהדפדפן
 * פנוי מונעת קפיצה ברגע שהדייר מחליף חומר.
 */
export function preloadStandardTextures(
  surfaces: { texture?: ProceduralTexture; baseColor: string; normalStrength?: number }[],
  size: number,
): void {
  if (typeof window === "undefined") return;

  const run = () => {
    for (const surface of surfaces) {
      getProceduralTextures(surface.texture, surface.baseColor, surface.normalStrength ?? 0, size);
    }
  };

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (idle) idle(run);
  else window.setTimeout(run, 400);
}

/** משחרר את כל המרקמים מהזיכרון. נקרא כשהמסך נסגר. */
export function disposeProceduralTextures(): void {
  for (const textures of cache.values()) {
    textures.map?.dispose();
    textures.normalMap?.dispose();
    textures.roughnessMap?.dispose();
  }
  cache.clear();
}
