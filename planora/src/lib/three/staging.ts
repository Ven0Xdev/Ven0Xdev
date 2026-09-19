/**
 * ריהוט המחשה.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * כל מה שנוצר כאן מסומן `visualizationOnly` — **הוא אינו חלק מהביצוע**.
 * ספה, מיטה או שולחן אינם נמסרים עם הדירה, ואינם מופיעים במפרט או במחיר.
 * הם קיימים כדי שהדייר יבין גודל של חדר, ולא כדי להבטיח לו רהיטים.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * מוצרים שכן משפיעים על הביצוע — מטבח, ריצוף, כלים סניטריים, דלתות —
 * מגיעים מהתוכנית ומקטלוג הספקים, לא מכאן.
 *
 * כל רהיט מורכב מכמה חלקים: לספה יש מושב, משענת, ידיות וכריות; לשולחן יש
 * לוח ורגליים. קופסה אחת לכל רהיט נראית כמו מודל מחשב, ולא כמו חדר.
 */

import type { ApartmentGeometry, RoomGeometry, Vec2 } from "@/lib/geometry/types";
import type { PbrMaterial } from "@/lib/visualization/material-library";
import { FAMILY_DEFAULTS } from "@/lib/visualization/material-library";

export type StagingShape = "ROUNDED" | "CYLINDER" | "SPHERE";

export interface StagingItem {
  id: string;
  label: string;
  /** מרכז הפריט במטרים */
  center: Vec2;
  widthM: number;
  depthM: number;
  heightM: number;
  /** גובה הבסיס מהרצפה */
  baseM: number;
  shape: StagingShape;
  /** רדיוס הפינות. פינה חדה לחלוטין אינה תופסת אור ונראית מלאכותית. */
  cornerRadius: number;
  appearance: PbrMaterial;
}

// ---------------------------------------------------------------------------
// חומרי ריהוט
// ---------------------------------------------------------------------------

function material(
  family: keyof typeof FAMILY_DEFAULTS,
  baseColor: string,
  overrides: Partial<PbrMaterial> = {},
): PbrMaterial {
  return { family, baseColor, ...FAMILY_DEFAULTS[family], ...overrides };
}

const UPHOLSTERY = material("FABRIC", "#a49b8c");
const UPHOLSTERY_CUSHION = material("FABRIC", "#b3a99a");
const UPHOLSTERY_DARK = material("FABRIC", "#4f535c");
const ACCENT_CUSHION = material("FABRIC", "#8a6f5c");
const RUG = material("FABRIC", "#c3b9a9", { roughness: 0.99, envIntensity: 0.1 });
const OAK = material("WOOD", "#b08a5e");
const WALNUT = material("WOOD", "#5e4130");
const MATTRESS = material("FABRIC", "#efece5");
const PILLOW = material("FABRIC", "#f6f4ef");
const FOLIAGE = material("FABRIC", "#4d6b4a", { roughness: 0.9, envIntensity: 0.2 });
const POT = material("CERAMIC", "#9d9284", { texture: undefined, clearcoat: 0.1 });
const STONE_TOP = material("MARBLE", "#e2ded6");
const BLACK_METAL = material("METAL", "#2a2b2e", { roughness: 0.42, metalness: 0.7 });
const LAMPSHADE = material("CERAMIC", "#f3ede2", {
  texture: undefined,
  emissive: "#ffd9a8",
  emissiveIntensity: 0.55,
});

// ---------------------------------------------------------------------------
// מסגרת מיקום
// ---------------------------------------------------------------------------

interface RoomBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  center: Vec2;
  /** האם החדר ארוך יותר בציר X */
  horizontal: boolean;
}

function roomBox(room: RoomGeometry): RoomBox {
  const xs = room.outline.map((point) => point.x);
  const zs = room.outline.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    center: room.center,
    horizontal: maxX - minX >= maxZ - minZ,
  };
}

/**
 * ממקם חלקי רהיט במערכת צירים מקומית של החדר.
 *
 * `along` הוא הציר הארוך של החדר ו-`across` הקצר. כך אותו קוד מסדר ספה גם
 * בחדר לרוחב וגם בחדר לאורך, בלי שכפול.
 */
function placer(anchor: Vec2, horizontal: boolean) {
  return function place(
    id: string,
    label: string,
    along: number,
    across: number,
    baseM: number,
    sizeAlong: number,
    sizeAcross: number,
    heightM: number,
    appearance: PbrMaterial,
    options: { shape?: StagingShape; cornerRadius?: number } = {},
  ): StagingItem {
    return {
      id,
      label,
      center: horizontal
        ? { x: anchor.x + along, z: anchor.z + across }
        : { x: anchor.x + across, z: anchor.z + along },
      widthM: horizontal ? sizeAlong : sizeAcross,
      depthM: horizontal ? sizeAcross : sizeAlong,
      heightM,
      baseM,
      shape: options.shape ?? "ROUNDED",
      cornerRadius: options.cornerRadius ?? 0.035,
      appearance,
    };
  };
}

const CLEARANCE = 0.25;

// ---------------------------------------------------------------------------
// רהיטים מורכבים
// ---------------------------------------------------------------------------

/** ספה: בסיס, משענת, שתי ידיות, כריות מושב וכריות נוי */
function sofa(
  id: string,
  place: ReturnType<typeof placer>,
  along: number,
  across: number,
  length: number,
): StagingItem[] {
  const depth = 0.92;
  const armWidth = 0.17;
  const seatLength = length - armWidth * 2;

  const items: StagingItem[] = [
    place(`${id}:base`, "ספה", along, across, 0.08, length, depth, 0.3, UPHOLSTERY, {
      cornerRadius: 0.05,
    }),
    place(
      `${id}:back`,
      "ספה",
      along,
      across - depth / 2 + 0.11,
      0.08,
      length,
      0.22,
      0.78,
      UPHOLSTERY,
      { cornerRadius: 0.06 },
    ),
  ];

  for (const side of [-1, 1]) {
    items.push(
      place(
        `${id}:arm${side > 0 ? "a" : "b"}`,
        "ספה",
        along + (side * (length - armWidth)) / 2,
        across,
        0.08,
        armWidth,
        depth,
        0.56,
        UPHOLSTERY,
        { cornerRadius: 0.07 },
      ),
    );
  }

  // שתי כריות מושב, עם רווח ביניהן
  for (const side of [-1, 1]) {
    items.push(
      place(
        `${id}:seat${side > 0 ? "a" : "b"}`,
        "ספה",
        along + (side * seatLength) / 4,
        across + 0.05,
        0.38,
        seatLength / 2 - 0.03,
        depth - 0.26,
        0.14,
        UPHOLSTERY_CUSHION,
        { cornerRadius: 0.06 },
      ),
    );
  }

  // כריות נוי — מה שהופך ספה מקופסה לרהיט
  for (const side of [-1, 1]) {
    items.push(
      place(
        `${id}:cushion${side > 0 ? "a" : "b"}`,
        "כרית",
        along + side * (seatLength / 2 - 0.26),
        across - depth / 2 + 0.3,
        0.52,
        0.38,
        0.14,
        0.38,
        ACCENT_CUSHION,
        { cornerRadius: 0.08 },
      ),
    );
  }

  return items;
}

/** שולחן עם לוח וארבע רגליים */
function table(
  id: string,
  label: string,
  place: ReturnType<typeof placer>,
  along: number,
  across: number,
  sizeAlong: number,
  sizeAcross: number,
  height: number,
  top: PbrMaterial,
  legs: PbrMaterial,
  legThickness = 0.07,
): StagingItem[] {
  const items: StagingItem[] = [
    place(
      `${id}:top`,
      label,
      along,
      across,
      height - 0.05,
      sizeAlong,
      sizeAcross,
      0.05,
      top,
      { cornerRadius: 0.02 },
    ),
  ];

  const insetAlong = sizeAlong / 2 - legThickness / 2 - 0.08;
  const insetAcross = sizeAcross / 2 - legThickness / 2 - 0.07;

  for (const alongSide of [-1, 1]) {
    for (const acrossSide of [-1, 1]) {
      items.push(
        place(
          `${id}:leg${alongSide}${acrossSide}`,
          label,
          along + alongSide * insetAlong,
          across + acrossSide * insetAcross,
          0,
          legThickness,
          legThickness,
          height - 0.05,
          legs,
          { cornerRadius: 0.012 },
        ),
      );
    }
  }

  return items;
}

/** כיסא: מושב, משענת וארבע רגליים */
function chair(
  id: string,
  place: ReturnType<typeof placer>,
  along: number,
  across: number,
  backTowards: -1 | 1,
): StagingItem[] {
  const seat = 0.44;
  const items: StagingItem[] = [
    place(`${id}:seat`, "כיסא", along, across, 0.44, seat, seat, 0.06, UPHOLSTERY_DARK, {
      cornerRadius: 0.03,
    }),
    place(
      `${id}:back`,
      "כיסא",
      along,
      across + backTowards * (seat / 2 - 0.04),
      0.5,
      seat,
      0.06,
      0.46,
      UPHOLSTERY_DARK,
      { cornerRadius: 0.04 },
    ),
  ];

  for (const alongSide of [-1, 1]) {
    for (const acrossSide of [-1, 1]) {
      items.push(
        place(
          `${id}:leg${alongSide}${acrossSide}`,
          "כיסא",
          along + alongSide * (seat / 2 - 0.05),
          across + acrossSide * (seat / 2 - 0.05),
          0,
          0.04,
          0.04,
          0.44,
          WALNUT,
          { cornerRadius: 0.008 },
        ),
      );
    }
  }

  return items;
}

/** עציץ: כלי חרס וצמרת */
function plant(
  id: string,
  place: ReturnType<typeof placer>,
  along: number,
  across: number,
  scale = 1,
): StagingItem[] {
  return [
    place(`${id}:pot`, "עציץ", along, across, 0, 0.34 * scale, 0.34 * scale, 0.36 * scale, POT, {
      shape: "CYLINDER",
    }),
    place(
      `${id}:foliage`,
      "צמח",
      along,
      across,
      0.32 * scale,
      0.56 * scale,
      0.56 * scale,
      0.62 * scale,
      FOLIAGE,
      { shape: "SPHERE" },
    ),
  ];
}

/** מנורה תלויה — נדלקת בערב ומעגנת את פינת האוכל */
function pendant(
  id: string,
  place: ReturnType<typeof placer>,
  along: number,
  across: number,
  ceilingM: number,
): StagingItem[] {
  return [
    place(`${id}:rod`, "מנורה", along, across, ceilingM - 0.55, 0.03, 0.03, 0.55, BLACK_METAL, {
      shape: "CYLINDER",
    }),
    place(
      `${id}:shade`,
      "מנורה",
      along,
      across,
      ceilingM - 0.72,
      0.34,
      0.34,
      0.2,
      LAMPSHADE,
      { shape: "CYLINDER" },
    ),
  ];
}

// ---------------------------------------------------------------------------
// סידור לפי סוג חדר
// ---------------------------------------------------------------------------

function stageLiving(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (box.width < 2.8 || box.depth < 2.6) return [];

  const place = placer(box.center, box.horizontal);
  const along = box.horizontal ? box.width : box.depth;
  const across = box.horizontal ? box.depth : box.width;

  // בחלל משולב הספה יושבת בחצי אחד, ופינת האוכל בשני
  const combined = room.areaSqm >= 20;
  const seatingCentre = combined ? -along * 0.22 : 0;
  const sofaLength = Math.min(2.35, along * (combined ? 0.42 : 0.6));
  const wallOffset = across / 2 - 0.92 / 2 - CLEARANCE;

  const items: StagingItem[] = [
    place(
      `${room.id}:rug`,
      "שטיח",
      seatingCentre,
      0,
      0.004,
      Math.min(2.7, along * (combined ? 0.4 : 0.66)),
      Math.min(2.1, across * 0.66),
      0.012,
      RUG,
      { cornerRadius: 0.004 },
    ),
    ...sofa(`${room.id}:sofa`, place, seatingCentre, -wallOffset, sofaLength),
    ...table(
      `${room.id}:coffee`,
      "שולחן סלון",
      place,
      seatingCentre,
      0.1,
      Math.min(1.1, sofaLength * 0.55),
      0.58,
      0.4,
      WALNUT,
      WALNUT,
      0.05,
    ),
    // יחידת טלוויזיה נמוכה מול הספה
    place(
      `${room.id}:console`,
      "יחידת טלוויזיה",
      seatingCentre,
      across / 2 - 0.22 - CLEARANCE,
      0.06,
      Math.min(1.9, sofaLength * 0.9),
      0.42,
      0.4,
      OAK,
      { cornerRadius: 0.02 },
    ),
    place(
      `${room.id}:tv`,
      "מסך",
      seatingCentre,
      across / 2 - 0.12 - CLEARANCE,
      0.62,
      Math.min(1.3, sofaLength * 0.62),
      0.05,
      0.72,
      BLACK_METAL,
      { cornerRadius: 0.01 },
    ),
    ...plant(`${room.id}:plant`, place, seatingCentre - along * 0.3, -wallOffset + 0.1, 1.05),
  ];

  if (combined) {
    const diningCentre = along * 0.26;
    items.push(
      ...table(
        `${room.id}:dining`,
        "שולחן אוכל",
        place,
        diningCentre,
        0,
        Math.min(1.7, along * 0.3),
        Math.min(0.95, across * 0.42),
        0.75,
        OAK,
        WALNUT,
      ),
    );

    for (const side of [-1, 1] as const) {
      for (const offset of [-0.32, 0.32]) {
        items.push(
          ...chair(
            `${room.id}:chair${side}${offset > 0 ? "a" : "b"}`,
            place,
            diningCentre + offset,
            side * 0.72,
            side,
          ),
        );
      }
    }

    items.push(...pendant(`${room.id}:pendant`, place, diningCentre, 0, room.ceilingHeightM));
  }

  return items;
}

function stageDining(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (box.width < 2.2 || box.depth < 2.2) return [];

  const place = placer(box.center, box.horizontal);
  const along = box.horizontal ? box.width : box.depth;
  const across = box.horizontal ? box.depth : box.width;

  const items = table(
    `${room.id}:dining`,
    "שולחן אוכל",
    place,
    0,
    0,
    Math.min(1.6, along * 0.5),
    Math.min(0.95, across * 0.45),
    0.75,
    OAK,
    WALNUT,
  );

  for (const side of [-1, 1] as const) {
    for (const offset of [-0.3, 0.3]) {
      items.push(
        ...chair(
          `${room.id}:chair${side}${offset > 0 ? "a" : "b"}`,
          place,
          offset,
          side * 0.7,
          side,
        ),
      );
    }
  }

  items.push(...pendant(`${room.id}:pendant`, place, 0, 0, room.ceilingHeightM));

  return items;
}

function stageBedroom(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (box.width < 2.4 || box.depth < 2.4) return [];

  // המיטה עומדת לאורך הציר הקצר, עם הראש אל הקיר
  const headAtMin = box.depth >= box.width;
  const place = placer(box.center, !headAtMin);
  const roomAlong = headAtMin ? box.depth : box.width;
  const roomAcross = headAtMin ? box.width : box.depth;

  const isMaster = room.areaSqm >= 11;
  const bedWidth = Math.min(isMaster ? 1.6 : 1.05, roomAcross - 1.1);
  const bedLength = Math.min(2.0, roomAlong - 1.0);
  if (bedWidth < 0.8 || bedLength < 1.6) return [];

  const headAlong = -roomAlong / 2 + CLEARANCE;
  const bedAlong = headAlong + bedLength / 2;

  const items: StagingItem[] = [
    // בסיס, מזרן וראש מיטה
    place(`${room.id}:bed-base`, "מיטה", bedAlong, 0, 0.05, bedLength, bedWidth, 0.26, WALNUT, {
      cornerRadius: 0.02,
    }),
    place(
      `${room.id}:mattress`,
      "מיטה",
      bedAlong,
      0,
      0.31,
      bedLength - 0.06,
      bedWidth - 0.06,
      0.26,
      MATTRESS,
      { cornerRadius: 0.05 },
    ),
    place(
      `${room.id}:headboard`,
      "מיטה",
      headAlong + 0.05,
      0,
      0.05,
      0.1,
      bedWidth + 0.12,
      1.0,
      UPHOLSTERY,
      { cornerRadius: 0.05 },
    ),
  ];

  // כריות
  for (const side of [-1, 1]) {
    items.push(
      place(
        `${room.id}:pillow${side > 0 ? "a" : "b"}`,
        "כרית",
        headAlong + 0.42,
        side * (bedWidth / 4),
        0.56,
        0.36,
        bedWidth / 2 - 0.08,
        0.12,
        PILLOW,
        { cornerRadius: 0.06 },
      ),
    );
  }

  // שידות לצד הראש, רק אם יש מקום
  const nightstandAcross = bedWidth / 2 + 0.28;
  if (nightstandAcross + 0.22 < roomAcross / 2 - 0.1) {
    for (const side of [-1, 1]) {
      items.push(
        place(
          `${room.id}:nightstand${side > 0 ? "a" : "b"}`,
          "שידה",
          headAlong + 0.24,
          side * nightstandAcross,
          0,
          0.42,
          0.38,
          0.48,
          WALNUT,
          { cornerRadius: 0.02 },
        ),
      );
    }
  }

  // ארון לאורך הקיר הנגדי
  const wardrobeAcross = Math.min(2.1, roomAcross * 0.62);
  items.push(
    place(
      `${room.id}:wardrobe`,
      "ארון",
      roomAlong / 2 - CLEARANCE - 0.3,
      0,
      0,
      0.58,
      wardrobeAcross,
      2.15,
      MATTRESS,
      { cornerRadius: 0.015 },
    ),
    // קו הפרדה בין דלתות הארון
    place(
      `${room.id}:wardrobe-line`,
      "ארון",
      roomAlong / 2 - CLEARANCE - 0.005,
      0,
      0.1,
      0.02,
      0.02,
      1.95,
      BLACK_METAL,
      { cornerRadius: 0.005 },
    ),
  );

  return items;
}

function stageBalcony(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (room.areaSqm < 3) return [];

  const place = placer(box.center, box.horizontal);
  const along = box.horizontal ? box.width : box.depth;
  const across = box.horizontal ? box.depth : box.width;

  const items: StagingItem[] = [];
  const seatOffset = Math.min(0.7, along * 0.22);

  for (const side of [-1, 1]) {
    const id = `${room.id}:lounge${side > 0 ? "a" : "b"}`;
    items.push(
      place(`${id}:seat`, "כורסת חוץ", side * seatOffset, 0, 0.1, 0.66, 0.68, 0.3, UPHOLSTERY_DARK, {
        cornerRadius: 0.05,
      }),
      place(
        `${id}:back`,
        "כורסת חוץ",
        side * seatOffset,
        -0.26,
        0.1,
        0.66,
        0.14,
        0.68,
        UPHOLSTERY_DARK,
        { cornerRadius: 0.05 },
      ),
      place(
        `${id}:cushion`,
        "כורסת חוץ",
        side * seatOffset,
        0.04,
        0.38,
        0.58,
        0.56,
        0.1,
        UPHOLSTERY_CUSHION,
        { cornerRadius: 0.05 },
      ),
    );
  }

  items.push(
    ...table(
      `${room.id}:outdoor-table`,
      "שולחן חוץ",
      place,
      0,
      0.05,
      0.5,
      0.5,
      0.44,
      STONE_TOP,
      BLACK_METAL,
      0.04,
    ),
    ...plant(`${room.id}:planter-a`, place, along / 2 - 0.4, across / 2 - 0.35, 0.85),
    ...plant(`${room.id}:planter-b`, place, -along / 2 + 0.4, across / 2 - 0.35, 0.7),
  );

  return items;
}

// ---------------------------------------------------------------------------

/**
 * מסדר את הדירה.
 *
 * @param cutHeightM גובה חיתוך התצוגה. רהיט גבוה נחתך יחד עם הקירות, אחרת
 *                   ארון היה בולט מעל דירה חתוכה ונראה כמו טעות.
 */
export type StagingDetail = "FULL" | "REDUCED";

/** פריטים שמוסרים ברמת פירוט מופחתת — נוי, לא הבנה של החלל */
const DECORATIVE = /:(cushion|pillow|plant|planter|foliage|pot|rug|tv|pendant)/;

export function buildStaging(
  geometry: ApartmentGeometry,
  cutHeightM: number,
  detail: StagingDetail = "FULL",
): StagingItem[] {
  const items: StagingItem[] = [];

  for (const room of geometry.rooms) {
    const box = roomBox(room);

    switch (room.kind) {
      case "LIVING":
        items.push(...stageLiving(room, box));
        break;
      case "DINING":
        items.push(...stageDining(room, box));
        break;
      case "BEDROOM":
        items.push(...stageBedroom(room, box));
        break;
      case "BALCONY":
        items.push(...stageBalcony(room, box));
        break;
      default:
        // מטבח, חדר רחצה, ממ"ד ומסדרון — מה שבהם מגיע מהתוכנית, לא מהעיצוב
        break;
    }
  }

  return items
    // ברמת פירוט מופחתת נשארים הרהיטים שמלמדים על גודל החדר, ונעלם הנוי
    .filter((item) => detail === "FULL" || !DECORATIVE.test(item.id))
    .filter((item) => item.baseM < cutHeightM)
    .map((item) =>
      item.baseM + item.heightM <= cutHeightM
        ? item
        : { ...item, heightM: Math.max(0.05, cutHeightM - item.baseM) },
    );
}
