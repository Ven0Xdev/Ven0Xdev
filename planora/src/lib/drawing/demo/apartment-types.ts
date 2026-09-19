/**
 * תוכניות טיפוסי הדירות.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * כל טיפוס דירה מקבל תוכנית משלו: מעטפת אחרת, מספר חדרים אחר, מרפסת אחרת.
 * זה מה שמוכיח שהתצוגה נבנית מהתוכנית של הדירה ולא מדירת הדגמה אחת.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * דירה 42 (`apartment-42.ts`) נשארת כפי שהיא — היא ה-Showcase של השוואת
 * השינויים, ובדיקות V1 נשענות עליה בדיוק.
 *
 * יחידות: סנטימטרים. ציר X ימינה, ציר Y מטה.
 */

import type { DrawingDocument, DrawingElement, ElementMetadata, ElementType } from "../types";
import { computeBounds } from "../geometry";

const WALL = 20;
/** עומק הרצועה הקדמית — סלון, מטבח, ממ"ד */
const FRONT_DEPTH = 400;
const CORRIDOR_DEPTH = 100;
/** עומק רצועת חדרי השינה */
const REAR_DEPTH = 320;
const KITCHEN_WIDTH = 320;
const SAFE_ROOM_WIDTH = 220;
const BATHROOM_WIDTH = 180;
const WC_WIDTH = 200;

function el(
  id: string,
  type: ElementType,
  x: number,
  y: number,
  width: number,
  height: number,
  metadata: ElementMetadata = {},
): DrawingElement {
  return { id, type, x, y, width, height, rotation: 0, metadata };
}

function point(
  id: string,
  type: ElementType,
  x: number,
  y: number,
  metadata: ElementMetadata = {},
): DrawingElement {
  return { id, type, x: x - 9, y: y - 9, width: 18, height: 18, rotation: 0, metadata };
}

export interface ApartmentTypeSpec {
  /** שם הטיפוס כפי שהוא מופיע בפרויקט */
  name: string;
  /** מספר חדרי שינה */
  bedrooms: number;
  /** רוחב המעטפת */
  widthCm: number;
  balconyWidthCm: number;
  balconyDepthCm: number;
}

/** הטיפוסים של פרויקט ההדגמה */
export const DEMO_APARTMENT_TYPES: ApartmentTypeSpec[] = [
  { name: "טיפוס 3 חדרים", bedrooms: 2, widthCm: 980, balconyWidthCm: 300, balconyDepthCm: 170 },
  { name: "טיפוס 4 חדרים", bedrooms: 3, widthCm: 1180, balconyWidthCm: 360, balconyDepthCm: 220 },
  { name: "טיפוס 5 חדרים", bedrooms: 4, widthCm: 1420, balconyWidthCm: 440, balconyDepthCm: 270 },
];

/**
 * בונה תוכנית סטנדרט לטיפוס דירה.
 *
 * הפריסה קבועה בעקרונותיה — רצועה קדמית, מסדרון, רצועת חדרים — והמידות
 * נגזרות מהטיפוס. כך שתי דירות מטיפוסים שונים נבדלות בחדרים, בקירות,
 * בפתחים ובמרפסת, ולא רק בשם.
 */
export function buildApartmentTypePlan(spec: ApartmentTypeSpec): DrawingDocument {
  const { widthCm, bedrooms } = spec;
  const innerLeft = WALL;
  const innerRight = widthCm - WALL;
  const totalDepth = WALL + FRONT_DEPTH + WALL + CORRIDOR_DEPTH + WALL + REAR_DEPTH + WALL;

  const frontTop = WALL;
  const corridorTop = frontTop + FRONT_DEPTH + WALL;
  const rearTop = corridorTop + CORRIDOR_DEPTH + WALL;
  const rearBottom = rearTop + REAR_DEPTH;

  const elements: DrawingElement[] = [];

  // --- רצועה קדמית: סלון, מטבח, ממ"ד ---
  const safeRoomX = innerRight - SAFE_ROOM_WIDTH;
  const kitchenX = safeRoomX - WALL - KITCHEN_WIDTH;
  const livingWidth = kitchenX - WALL - innerLeft;

  elements.push(
    el("R-LIV", "ROOM", innerLeft, frontTop, livingWidth, FRONT_DEPTH, {
      label: "סלון ופינת אוכל",
    }),
    el("R-KIT", "ROOM", kitchenX, frontTop, KITCHEN_WIDTH, FRONT_DEPTH, { label: "מטבח" }),
    el("R-MMD", "ROOM", safeRoomX, frontTop, SAFE_ROOM_WIDTH, FRONT_DEPTH, { label: 'ממ"ד' }),
    el("R-COR", "ROOM", innerLeft, corridorTop, innerRight - innerLeft, CORRIDOR_DEPTH, {
      label: "מסדרון",
    }),
  );

  // --- רצועת חדרי שינה, חדר רחצה ושירותים ---
  const serviceWidth = BATHROOM_WIDTH + WALL + WC_WIDTH;
  const bedroomsWidth = innerRight - innerLeft - WALL - serviceWidth - WALL * (bedrooms - 1);
  // חדר ההורים גדול מהשאר
  const childWidth = Math.round(bedroomsWidth / (bedrooms + 0.4));
  const masterWidth = bedroomsWidth - childWidth * (bedrooms - 1);

  let cursor = innerLeft;
  for (let index = 0; index < bedrooms; index += 1) {
    const width = index === 0 ? masterWidth : childWidth;
    elements.push(
      el(`R-BR${index + 1}`, "ROOM", cursor, rearTop, width, REAR_DEPTH, {
        label: index === 0 ? "חדר שינה הורים" : `חדר ילדים ${index}`,
      }),
      // חלון בקיר האחורי לכל חדר
      el(
        `WN-BR${index + 1}`,
        "WINDOW",
        cursor + width / 2 - 60,
        rearBottom,
        120,
        WALL,
        { room: index === 0 ? "חדר שינה הורים" : `חדר ילדים ${index}`, tag: `W${index + 1}` },
      ),
      // דלת למסדרון
      el(`DR-BR${index + 1}`, "DOOR", cursor + 40, corridorTop + CORRIDOR_DEPTH, 80, WALL, {
        label: "דלת פנים",
      }),
      point(`LT-BR${index + 1}`, "LIGHT", cursor + width / 2, rearTop + REAR_DEPTH / 2),
      point(`OU-BR${index + 1}A`, "OUTLET", cursor + 60, rearTop + 40),
      point(`OU-BR${index + 1}B`, "OUTLET", cursor + width - 60, rearTop + 40),
    );

    if (index > 0) {
      elements.push(
        el(`PT-BR${index}`, "PARTITION", cursor - WALL, rearTop, WALL, REAR_DEPTH, {
          material: "גבס",
        }),
      );
    }

    cursor += width + WALL;
  }

  const bathroomX = cursor;
  const wcX = bathroomX + BATHROOM_WIDTH + WALL;

  elements.push(
    el("PT-BTH", "PARTITION", bathroomX - WALL, rearTop, WALL, REAR_DEPTH, { material: "גבס" }),
    el("R-BTH", "ROOM", bathroomX, rearTop, BATHROOM_WIDTH, REAR_DEPTH, { label: "חדר רחצה" }),
    el("PT-WC", "PARTITION", wcX - WALL, rearTop, WALL, REAR_DEPTH, { material: "גבס" }),
    el("R-WC", "ROOM", wcX, rearTop, WC_WIDTH, REAR_DEPTH, { label: "שירותי אורחים" }),
    el("DR-BTH", "DOOR", bathroomX + 40, corridorTop + CORRIDOR_DEPTH, 70, WALL, {
      label: "דלת פנים",
    }),
    el("DR-WC", "DOOR", wcX + 40, corridorTop + CORRIDOR_DEPTH, 70, WALL, { label: "דלת פנים" }),
  );

  // --- מרפסת ---
  const balconyX = Math.round(innerLeft + livingWidth / 2 - spec.balconyWidthCm / 2);
  elements.push(
    el("R-BAL", "ROOM", balconyX, -spec.balconyDepthCm, spec.balconyWidthCm, spec.balconyDepthCm, {
      label: "מרפסת שמש",
    }),
    el("RL-BAL-W", "RAILING", balconyX, -spec.balconyDepthCm, WALL / 2, spec.balconyDepthCm, {}),
    el(
      "RL-BAL-E",
      "RAILING",
      balconyX + spec.balconyWidthCm - WALL / 2,
      -spec.balconyDepthCm,
      WALL / 2,
      spec.balconyDepthCm,
      {},
    ),
    el("RL-BAL-N", "RAILING", balconyX, -spec.balconyDepthCm, spec.balconyWidthCm, WALL / 2, {}),
    // דלת הזזה מהסלון אל המרפסת
    el("SD-BAL", "SLIDING_DOOR", balconyX + 40, 0, spec.balconyWidthCm - 80, WALL, {
      label: "דלת הזזה",
      room: "סלון ופינת אוכל",
    }),
  );

  // --- קירות מעטפת ---
  elements.push(
    el("WL-N1", "WALL", 0, 0, balconyX, WALL, { structural: true, material: "בטון" }),
    el(
      "WL-N2",
      "WALL",
      balconyX + spec.balconyWidthCm,
      0,
      widthCm - balconyX - spec.balconyWidthCm,
      WALL,
      { structural: true, material: "בטון" },
    ),
    el("WL-S", "WALL", 0, totalDepth - WALL, widthCm, WALL, { structural: true, material: "בטון" }),
    el("WL-W", "WALL", 0, 0, WALL, totalDepth, { structural: true, material: "בטון" }),
    el("WL-E", "WALL", widthCm - WALL, 0, WALL, totalDepth, { structural: true, material: "בטון" }),
    // ממ"ד — קירות בטון מזוין שלעולם אינם משתנים
    el("WL-M1", "WALL", safeRoomX - WALL, frontTop, WALL, FRONT_DEPTH, {
      structural: true,
      material: "בטון מזוין",
      tag: "MMD-1",
    }),
    el("PT-KIT", "PARTITION", kitchenX - WALL, frontTop, WALL, FRONT_DEPTH, { material: "גבס" }),
    // הקיר בין הרצועה הקדמית למסדרון, עם פתח מעבר לסלון
    el("PT-COR-A", "PARTITION", innerLeft, corridorTop - WALL, livingWidth - 140, WALL, {
      material: "גבס",
    }),
    el(
      "PT-COR-B",
      "PARTITION",
      innerLeft + livingWidth,
      corridorTop - WALL,
      innerRight - innerLeft - livingWidth,
      WALL,
      { material: "גבס" },
    ),
  );

  // --- מטבח ---
  elements.push(
    el("KU-1", "KITCHEN_UNIT", kitchenX + 10, frontTop + 10, KITCHEN_WIDTH - 20, 60, {
      label: "ארון תחתון",
    }),
    el("KU-2", "KITCHEN_UNIT", kitchenX + 10, frontTop + 90, 120, 60, { label: "כיריים" }),
    el("KU-3", "KITCHEN_UNIT", kitchenX + 10, frontTop + FRONT_DEPTH - 130, 140, 60, {
      label: "אי מטבח",
    }),
    point("WP-KIT", "WATER_POINT", kitchenX + 80, frontTop + 40, { label: "נקודת מים" }),
    el("WN-KIT", "WINDOW", kitchenX + 60, 0, 140, WALL, { room: "מטבח", tag: "WK" }),
  );

  // --- כלים סניטריים ---
  elements.push(
    el("SN-WC1", "SANITARY", bathroomX + 20, rearTop + 30, 60, 80, { label: "אסלה" }),
    el("SN-BSN1", "SANITARY", bathroomX + 20, rearTop + 150, 70, 50, { label: "כיור" }),
    el("SN-BATH", "SANITARY", bathroomX + 10, rearTop + REAR_DEPTH - 90, BATHROOM_WIDTH - 20, 80, {
      label: "אמבטיה",
    }),
    el("SN-WC2", "SANITARY", wcX + 20, rearTop + 30, 60, 80, { label: "אסלה" }),
    el("SN-BSN2", "SANITARY", wcX + 20, rearTop + 150, 70, 50, { label: "כיור" }),
  );

  // --- כניסה ותאורה כללית ---
  elements.push(
    el("DR-ENT", "DOOR", widthCm - WALL, corridorTop + 20, WALL, 90, { label: "דלת כניסה" }),
    point("LT-LIV", "LIGHT", innerLeft + livingWidth / 2, frontTop + FRONT_DEPTH / 2),
    point("LT-KIT", "LIGHT", kitchenX + KITCHEN_WIDTH / 2, frontTop + FRONT_DEPTH / 2),
    point("LT-COR", "LIGHT", (innerLeft + innerRight) / 2, corridorTop + CORRIDOR_DEPTH / 2),
    point("OU-LIV-A", "OUTLET", innerLeft + 60, frontTop + 60),
    point("OU-LIV-B", "OUTLET", innerLeft + livingWidth - 60, frontTop + 60),
    point("OU-KIT", "OUTLET", kitchenX + 60, frontTop + 80),
  );

  return {
    id: `plan-${spec.name}`,
    name: `${spec.name} — תוכנית סטנדרט`,
    units: "CM",
    scale: 1,
    bounds: computeBounds(elements),
    elements,
  };
}

/** התוכנית של טיפוס לפי שמו. טיפוס לא מוכר מקבל את טיפוס הביניים. */
export function planForApartmentType(typeName: string): DrawingDocument {
  const spec =
    DEMO_APARTMENT_TYPES.find((candidate) => candidate.name === typeName) ??
    DEMO_APARTMENT_TYPES[1];
  return buildApartmentTypePlan(spec);
}

/**
 * תוכנית השינויים של הטיפוס.
 *
 * אלה שינויים אמיתיים על אותה תוכנית: מחיצה שהוזזה, אסלה שהוזזה ונקודות
 * חשמל שנוספו. ההשוואה הדו-ממדית והתלת-ממדית נשענות על כך ששתי הגרסאות
 * מתארות את **אותה דירה**, אחרת כל שינוי היה נספר כהוספה והסרה.
 */
export function buildModifiedApartmentTypePlan(spec: ApartmentTypeSpec): DrawingDocument {
  const standard = buildApartmentTypePlan(spec);
  const elements = standard.elements.map((element) => ({ ...element }));

  const byId = (id: string) => elements.find((element) => element.id === id);

  // מחיצה בין חדרי הילדים הוזזה 70 ס"מ — חדר אחד גדל על חשבון השני
  const partition = byId("PT-BR1");
  if (partition) partition.x += 70;
  const secondBedroom = byId("R-BR2");
  if (secondBedroom) {
    secondBedroom.x += 70;
    secondBedroom.width -= 70;
  }
  const firstBedroom = byId("R-BR1");
  if (firstBedroom) firstBedroom.width += 70;

  // אסלת שירותי האורחים הוזזה 40 ס"מ
  const guestToilet = byId("SN-WC2");
  if (guestToilet) guestToilet.y += 40;

  // נקודות חשמל שנוספו בסלון ובחדר ההורים
  const living = byId("R-LIV");
  const master = byId("R-BR1");
  if (living) {
    elements.push(
      point("OU-LIV-C", "OUTLET", living.x + living.width - 140, living.y + living.height - 60),
      point("OU-LIV-D", "OUTLET", living.x + 140, living.y + living.height - 60),
    );
  }
  if (master) {
    elements.push(point("OU-BR1C", "OUTLET", master.x + 60, master.y + master.height - 50));
  }

  return {
    ...standard,
    id: `${standard.id}-modified`,
    name: `${spec.name} — תוכנית שינויים`,
    bounds: computeBounds(elements),
    elements,
  };
}

/** תוכנית השינויים של טיפוס לפי שמו */
export function modifiedPlanForApartmentType(typeName: string): DrawingDocument {
  const spec =
    DEMO_APARTMENT_TYPES.find((candidate) => candidate.name === typeName) ??
    DEMO_APARTMENT_TYPES[1];
  return buildModifiedApartmentTypePlan(spec);
}
