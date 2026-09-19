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
 */

import type { ApartmentGeometry, RoomGeometry, Vec2 } from "@/lib/geometry/types";
import type { PbrMaterial } from "@/lib/visualization/material-library";
import { FAMILY_DEFAULTS } from "@/lib/visualization/material-library";

export interface StagingItem {
  id: string;
  label: string;
  /** מרכז הפריט במטרים */
  center: Vec2;
  widthM: number;
  depthM: number;
  heightM: number;
  /** גובה הבסיס מהרצפה — שטיח על הרצפה, מדף על הקיר */
  baseM: number;
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

const UPHOLSTERY = material("FABRIC", "#8d8577");
const UPHOLSTERY_DARK = material("FABRIC", "#5d6068");
const RUG = material("FABRIC", "#b6ada0", { roughness: 0.98 });
const OAK = material("WOOD", "#a87e52");
const WALNUT = material("WOOD", "#6b4a33");
const LINEN = material("FABRIC", "#e5e0d6");
const PLANT = material("FABRIC", "#4b6b4a", { roughness: 0.85 });
const PLANTER = material("CERAMIC", "#9c9184", { texture: undefined });
const STONE_TOP = material("MARBLE", "#dedad3");

// ---------------------------------------------------------------------------
// עזרי מיקום
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
  const width = maxX - minX;
  const depth = maxZ - minZ;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    center: room.center,
    horizontal: width >= depth,
  };
}

/** מרווח מהקיר, כדי שרהיט לא ייראה שקוע בתוכו */
const CLEARANCE = 0.22;

// ---------------------------------------------------------------------------
// סידור לפי סוג חדר
// ---------------------------------------------------------------------------

function stageLiving(room: RoomGeometry, box: RoomBox): StagingItem[] {
  // חדר קטן מדי לא מקבל סידור — עדיף חלל ריק מאשר רהיטים דחוסים
  if (box.width < 2.8 || box.depth < 2.6) return [];

  const items: StagingItem[] = [];
  const along = box.horizontal ? box.width : box.depth;
  const across = box.horizontal ? box.depth : box.width;

  const sofaLength = Math.min(2.4, along * 0.55);
  const sofaDepth = 0.9;

  // ספה צמודה לקיר, שולחן קפה מולה, שטיח ביניהם, יחידת טלוויזיה בצד הנגדי
  const sofaOffset = across / 2 - sofaDepth / 2 - CLEARANCE;
  const consoleOffset = across / 2 - 0.2 - CLEARANCE;

  const place = (offsetAcross: number, offsetAlong: number): Vec2 =>
    box.horizontal
      ? { x: box.center.x + offsetAlong, z: box.center.z + offsetAcross }
      : { x: box.center.x + offsetAcross, z: box.center.z + offsetAlong };

  const size = (lengthAlong: number, lengthAcross: number): [number, number] =>
    box.horizontal ? [lengthAlong, lengthAcross] : [lengthAcross, lengthAlong];

  const [rugW, rugD] = size(Math.min(3, along * 0.62), Math.min(2.2, across * 0.62));
  items.push({
    id: `${room.id}:rug`,
    label: "שטיח",
    center: box.center,
    widthM: rugW,
    depthM: rugD,
    heightM: 0.02,
    baseM: 0,
    appearance: RUG,
  });

  const [sofaW, sofaD] = size(sofaLength, sofaDepth);
  items.push({
    id: `${room.id}:sofa`,
    label: "ספה",
    center: place(-sofaOffset, 0),
    widthM: sofaW,
    depthM: sofaD,
    heightM: 0.78,
    baseM: 0,
    appearance: UPHOLSTERY,
  });

  const [tableW, tableD] = size(Math.min(1.2, along * 0.3), 0.6);
  items.push({
    id: `${room.id}:coffee-table`,
    label: "שולחן סלון",
    center: box.center,
    widthM: tableW,
    depthM: tableD,
    heightM: 0.4,
    baseM: 0,
    appearance: WALNUT,
  });

  const [consoleW, consoleD] = size(Math.min(1.8, along * 0.45), 0.4);
  items.push({
    id: `${room.id}:console`,
    label: "יחידת טלוויזיה",
    center: place(consoleOffset, 0),
    widthM: consoleW,
    depthM: consoleD,
    heightM: 0.45,
    baseM: 0,
    appearance: OAK,
  });

  // עציץ בפינה
  items.push({
    id: `${room.id}:plant`,
    label: "צמח",
    center: place(-sofaOffset + 0.1, along / 2 - 0.55),
    widthM: 0.45,
    depthM: 0.45,
    heightM: 1.05,
    baseM: 0,
    appearance: PLANT,
  });

  return items;
}

function stageDining(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (box.width < 2.2 || box.depth < 2.2) return [];

  const tableW = Math.min(1.6, box.width * 0.5);
  const tableD = Math.min(0.95, box.depth * 0.45);

  const items: StagingItem[] = [
    {
      id: `${room.id}:dining-table`,
      label: "שולחן אוכל",
      center: box.center,
      widthM: tableW,
      depthM: tableD,
      heightM: 0.75,
      baseM: 0,
      appearance: OAK,
    },
  ];

  // ארבעה כיסאות, שניים בכל צד ארוך
  const seatOffsets: [number, number][] = [
    [-tableW / 3, -tableD / 2 - 0.35],
    [tableW / 3, -tableD / 2 - 0.35],
    [-tableW / 3, tableD / 2 + 0.35],
    [tableW / 3, tableD / 2 + 0.35],
  ];

  seatOffsets.forEach(([offsetX, offsetZ], index) => {
    items.push({
      id: `${room.id}:chair-${index}`,
      label: "כיסא",
      center: { x: box.center.x + offsetX, z: box.center.z + offsetZ },
      widthM: 0.44,
      depthM: 0.44,
      heightM: 0.9,
      baseM: 0,
      appearance: UPHOLSTERY_DARK,
    });
  });

  return items;
}

function stageBedroom(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (box.width < 2.4 || box.depth < 2.4) return [];

  // מיטה זוגית בחדר גדול, יחיד בקטן
  const isMaster = room.areaSqm >= 11;
  const bedWidth = isMaster ? 1.6 : 1.0;
  const bedLength = 2.0;

  const items: StagingItem[] = [];
  const headAtMinZ = box.depth >= box.width;

  const bedCenter: Vec2 = headAtMinZ
    ? { x: box.center.x, z: box.minZ + CLEARANCE + bedLength / 2 }
    : { x: box.minX + CLEARANCE + bedLength / 2, z: box.center.z };

  items.push({
    id: `${room.id}:bed`,
    label: "מיטה",
    center: bedCenter,
    widthM: headAtMinZ ? bedWidth : bedLength,
    depthM: headAtMinZ ? bedLength : bedWidth,
    heightM: 0.52,
    baseM: 0,
    appearance: LINEN,
  });

  // שידות לצד הראש
  const nightstandOffset = bedWidth / 2 + 0.3;
  for (const side of [-1, 1]) {
    const center: Vec2 = headAtMinZ
      ? { x: bedCenter.x + side * nightstandOffset, z: box.minZ + CLEARANCE + 0.28 }
      : { x: box.minX + CLEARANCE + 0.28, z: bedCenter.z + side * nightstandOffset };

    if (
      center.x < box.minX + 0.1 ||
      center.x > box.maxX - 0.1 ||
      center.z < box.minZ + 0.1 ||
      center.z > box.maxZ - 0.1
    ) {
      continue;
    }

    items.push({
      id: `${room.id}:nightstand-${side > 0 ? "a" : "b"}`,
      label: "שידה",
      center,
      widthM: 0.45,
      depthM: 0.4,
      heightM: 0.5,
      baseM: 0,
      appearance: WALNUT,
    });
  }

  // ארון לאורך הקיר הנגדי
  const wardrobeLength = Math.min(2.2, (headAtMinZ ? box.width : box.depth) * 0.6);
  items.push({
    id: `${room.id}:wardrobe`,
    label: "ארון",
    center: headAtMinZ
      ? { x: box.center.x, z: box.maxZ - CLEARANCE - 0.3 }
      : { x: box.maxX - CLEARANCE - 0.3, z: box.center.z },
    widthM: headAtMinZ ? wardrobeLength : 0.6,
    depthM: headAtMinZ ? 0.6 : wardrobeLength,
    heightM: 2.1,
    baseM: 0,
    appearance: LINEN,
  });

  return items;
}

function stageBalcony(room: RoomGeometry, box: RoomBox): StagingItem[] {
  if (room.areaSqm < 3) return [];

  const items: StagingItem[] = [];
  const along = box.horizontal ? box.width : box.depth;

  // שני מושבים ושולחן קטן ביניהם
  for (const side of [-1, 1]) {
    items.push({
      id: `${room.id}:lounge-${side > 0 ? "a" : "b"}`,
      label: "כורסת חוץ",
      center: box.horizontal
        ? { x: box.center.x + side * Math.min(0.75, along * 0.2), z: box.center.z }
        : { x: box.center.x, z: box.center.z + side * Math.min(0.75, along * 0.2) },
      widthM: 0.7,
      depthM: 0.7,
      heightM: 0.72,
      baseM: 0,
      appearance: UPHOLSTERY_DARK,
    });
  }

  items.push({
    id: `${room.id}:outdoor-table`,
    label: "שולחן חוץ",
    center: box.center,
    widthM: 0.5,
    depthM: 0.5,
    heightM: 0.42,
    baseM: 0,
    appearance: STONE_TOP,
  });

  // עציצים לאורך המעקה
  items.push({
    id: `${room.id}:planter`,
    label: "עציץ",
    center: box.horizontal
      ? { x: box.maxX - CLEARANCE - 0.25, z: box.center.z }
      : { x: box.center.x, z: box.maxZ - CLEARANCE - 0.25 },
    widthM: 0.42,
    depthM: 0.42,
    heightM: 0.85,
    baseM: 0,
    appearance: PLANTER,
  });

  return items;
}

// ---------------------------------------------------------------------------

/**
 * מסדר את הדירה.
 *
 * @param cutHeightM גובה חיתוך התצוגה. רהיט גבוה נחתך יחד עם הקירות, אחרת
 *                   ארון היה בולט מעל דירה חתוכה ונראה כמו טעות.
 */
export function buildStaging(
  geometry: ApartmentGeometry,
  cutHeightM: number,
): StagingItem[] {
  const items: StagingItem[] = [];

  for (const room of geometry.rooms) {
    const box = roomBox(room);

    switch (room.kind) {
      case "LIVING":
        items.push(...stageLiving(room, box));
        // חלל משולב מקבל גם פינת אוכל, בצד הרחוק מהספה
        if (room.areaSqm >= 20) {
          items.push(
            ...stageDining(
              room,
              box.horizontal
                ? { ...box, center: { x: box.center.x + box.width * 0.26, z: box.center.z } }
                : { ...box, center: { x: box.center.x, z: box.center.z + box.depth * 0.26 } },
            ),
          );
        }
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

  return items.map((item) =>
    item.baseM + item.heightM <= cutHeightM
      ? item
      : { ...item, heightM: Math.max(0.1, cutHeightM - item.baseM) },
  );
}
