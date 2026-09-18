/**
 * תוכנית ההדגמה — דירה 42, בניין A, קומה 11, פרויקט "פארק רזידנס".
 *
 * מעטפת הדירה: 1160 × 900 ס"מ, מרפסת שמש בולטת מצפון.
 * גרסה 1 = תוכנית הסטנדרט. גרסה 2 = תוכנית השינויים של המעצבת.
 * בין השתיים קיימים בדיוק 17 שינויים.
 */

import type { DrawingDocument, DrawingElement, ElementMetadata, ElementType } from "../types";
import { computeBounds } from "../geometry";

function el(
  id: string,
  type: ElementType,
  x: number,
  y: number,
  width: number,
  height: number,
  metadata: ElementMetadata = {},
  rotation = 0,
): DrawingElement {
  return { id, type, x, y, width, height, rotation, metadata };
}

/** נקודה חשמלית / סניטרית — מיוצגת כריבוע קטן סביב הנקודה */
function point(
  id: string,
  type: ElementType,
  x: number,
  y: number,
  metadata: ElementMetadata = {},
  rotation = 0,
): DrawingElement {
  return { id, type, x: x - 9, y: y - 9, width: 18, height: 18, rotation, metadata };
}

const ROOMS: DrawingElement[] = [
  el("R-LIV", "ROOM", 20, 20, 540, 400, { label: "סלון ופינת אוכל", areaLabel: "21.6 מ\"ר" }),
  el("R-KIT", "ROOM", 580, 20, 320, 400, { label: "מטבח", areaLabel: "12.8 מ\"ר" }),
  el("R-MMD", "ROOM", 920, 20, 220, 400, { label: "ממ\"ד", areaLabel: "8.8 מ\"ר" }),
  el("R-COR", "ROOM", 20, 440, 1120, 100, { label: "מסדרון", areaLabel: "11.2 מ\"ר" }),
  el("R-BR1", "ROOM", 20, 560, 400, 320, { label: "חדר שינה הורים", areaLabel: "12.8 מ\"ר" }),
  el("R-BR2", "ROOM", 440, 560, 260, 320, { label: "חדר ילדים", areaLabel: "8.3 מ\"ר" }),
  el("R-BTH", "ROOM", 720, 560, 180, 320, { label: "חדר רחצה", areaLabel: "5.8 מ\"ר" }),
  el("R-WC", "ROOM", 920, 560, 220, 320, { label: "שירותי אורחים", areaLabel: "7.0 מ\"ר" }),
  el("R-BAL", "ROOM", 220, -220, 360, 220, { label: "מרפסת שמש", areaLabel: "7.9 מ\"ר" }),
];

/** קירות חוץ וקירות ממ"ד — קונסטרוקטיביים */
const STRUCTURAL_WALLS: DrawingElement[] = [
  el("WL-N1", "WALL", 0, 0, 280, 20, { structural: true, material: "בטון", room: "מעטפת" }),
  el("WL-N2", "WALL", 500, 0, 660, 20, { structural: true, material: "בטון", room: "מעטפת" }),
  el("WL-S", "WALL", 0, 880, 1160, 20, { structural: true, material: "בטון", room: "מעטפת" }),
  el("WL-W", "WALL", 0, 0, 20, 900, { structural: true, material: "בטון", room: "מעטפת" }),
  el("WL-E", "WALL", 1140, 0, 20, 900, { structural: true, material: "בטון", room: "מעטפת" }),
  el("WL-M1", "WALL", 900, 20, 20, 400, {
    structural: true,
    material: "בטון מזוין",
    tag: "MMD-1",
    room: "ממ\"ד",
    notes: "קיר ממ\"ד — אין לבצע בו שינוי",
  }),
];

/** מחיצות פנים */
const PARTITIONS: DrawingElement[] = [
  el("W-01", "PARTITION", 560, 20, 20, 400, {
    tag: "W07",
    material: "בלוק",
    structural: false,
    room: "סלון ופינת אוכל",
    lengthM: 4,
  }),
  el("W-03", "PARTITION", 20, 420, 1120, 20, {
    tag: "W11",
    material: "בלוק",
    structural: false,
    room: "מסדרון",
    lengthM: 11.2,
  }),
  el("W-04", "PARTITION", 20, 540, 1120, 20, {
    tag: "W12",
    material: "בלוק",
    structural: false,
    room: "מסדרון",
    lengthM: 11.2,
  }),
  el("W-05", "PARTITION", 420, 560, 20, 320, {
    tag: "W15",
    material: "בלוק",
    structural: false,
    room: "חדר שינה הורים",
    lengthM: 3.2,
    notes: "מעבר צנרת אנכית",
  }),
  el("W-06", "PARTITION", 700, 560, 20, 320, {
    tag: "W16",
    material: "בלוק",
    structural: false,
    room: "חדר ילדים",
    lengthM: 3.2,
  }),
  el("W-07", "PARTITION", 900, 560, 20, 320, {
    tag: "W17",
    material: "בלוק",
    structural: false,
    room: "חדר רחצה",
    lengthM: 3.2,
  }),
];

const RAILINGS: DrawingElement[] = [
  el("RL-N", "RAILING", 220, -220, 360, 10, { room: "מרפסת שמש", lengthM: 3.6 }),
  el("RL-W", "RAILING", 220, -220, 10, 220, { room: "מרפסת שמש", lengthM: 2.2 }),
  el("RL-E", "RAILING", 570, -220, 10, 220, { room: "מרפסת שמש", lengthM: 2.2 }),
];

const DOORS: DrawingElement[] = [
  el("D-01", "DOOR", 0, 440, 20, 90, { label: "דלת כניסה", gender: "f", room: "מסדרון", swing: "in-x" }),
  el("D-02", "DOOR", 120, 420, 90, 20, { room: "סלון ופינת אוכל", swing: "in-y" }),
  el("D-03", "DOOR", 660, 420, 85, 20, { room: "מטבח", swing: "in-y" }),
  el("D-04", "DOOR", 980, 420, 90, 20, {
    label: "דלת ממ\"ד",
    gender: "f",
    room: "ממ\"ד",
    material: "פלדה",
    swing: "in-y",
  }),
  el("D-05", "DOOR", 150, 540, 85, 20, { room: "חדר שינה הורים", swing: "out-y" }),
  el("D-06", "DOOR", 500, 540, 85, 20, { room: "חדר ילדים", swing: "out-y" }),
  el("D-07", "DOOR", 770, 540, 75, 20, { room: "חדר רחצה", swing: "out-y" }),
  el("D-08", "DOOR", 980, 540, 75, 20, { room: "שירותי אורחים", swing: "out-y" }),
];

const WINDOWS: DrawingElement[] = [
  el("WN-01", "WINDOW", 70, 0, 150, 20, { room: "סלון ופינת אוכל" }),
  el("SD-01", "SLIDING_DOOR", 280, 0, 220, 20, {
    label: "יציאה למרפסת",
    gender: "f",
    room: "סלון ופינת אוכל",
  }),
  el("WN-02", "WINDOW", 640, 0, 180, 20, { room: "מטבח" }),
  el("WN-03", "WINDOW", 1140, 120, 20, 100, {
    label: "חלון ממ\"ד",
    gender: "m",
    room: "ממ\"ד",
    material: "פלדה",
  }),
  el("WN-04", "WINDOW", 120, 880, 220, 20, { room: "חדר שינה הורים" }),
  el("WN-05", "WINDOW", 480, 880, 180, 20, { room: "חדר ילדים" }),
  el("WN-06", "WINDOW", 760, 880, 90, 20, { room: "חדר רחצה" }),
  el("WN-07", "WINDOW", 980, 880, 90, 20, { room: "שירותי אורחים" }),
];

/** 34 שקעים בתוכנית הסטנדרט */
const OUTLETS: DrawingElement[] = [
  point("OUT-01", "OUTLET", 60, 40, { room: "סלון ופינת אוכל" }),
  point("OUT-02", "OUTLET", 190, 40, { room: "סלון ופינת אוכל" }),
  point("OUT-03", "OUTLET", 330, 40, { room: "סלון ופינת אוכל" }),
  point("OUT-04", "OUTLET", 470, 40, { room: "סלון ופינת אוכל" }),
  point("OUT-05", "OUTLET", 40, 150, { room: "סלון ופינת אוכל" }),
  point("OUT-06", "OUTLET", 40, 300, { room: "סלון ופינת אוכל" }),
  point("OUT-07", "OUTLET", 200, 400, { room: "סלון ופינת אוכל" }),
  point("OUT-08", "OUTLET", 420, 400, { room: "סלון ופינת אוכל" }),
  point("OUT-09", "OUTLET", 620, 40, { room: "מטבח" }),
  point("OUT-10", "OUTLET", 700, 40, { room: "מטבח" }),
  point("OUT-11", "OUTLET", 780, 40, { room: "מטבח" }),
  point("OUT-12", "OUTLET", 860, 40, { room: "מטבח" }),
  point("OUT-13", "OUTLET", 880, 150, { room: "מטבח" }),
  point("OUT-14", "OUTLET", 880, 300, { room: "מטבח" }),
  point("OUT-15", "OUTLET", 640, 400, { room: "מטבח" }),
  point("OUT-16", "OUTLET", 950, 40, { room: "ממ\"ד" }),
  point("OUT-17", "OUTLET", 1120, 300, { room: "ממ\"ד" }),
  point("OUT-18", "OUTLET", 300, 460, { room: "מסדרון" }),
  point("OUT-19", "OUTLET", 800, 460, { room: "מסדרון" }),
  point("OUT-20", "OUTLET", 60, 580, { room: "חדר שינה הורים" }),
  point("OUT-21", "OUTLET", 250, 580, { room: "חדר שינה הורים" }),
  point("OUT-22", "OUTLET", 40, 700, { room: "חדר שינה הורים" }),
  point("OUT-23", "OUTLET", 40, 820, { room: "חדר שינה הורים" }),
  point("OUT-24", "OUTLET", 150, 865, { room: "חדר שינה הורים" }),
  point("OUT-25", "OUTLET", 380, 865, { room: "חדר שינה הורים" }),
  point("OUT-26", "OUTLET", 470, 580, { room: "חדר ילדים" }),
  point("OUT-27", "OUTLET", 640, 580, { room: "חדר ילדים" }),
  point("OUT-28", "OUTLET", 460, 760, { room: "חדר ילדים" }),
  point("OUT-29", "OUTLET", 520, 865, { room: "חדר ילדים" }),
  point("OUT-30", "OUTLET", 680, 820, { room: "חדר ילדים" }),
  point("OUT-31", "OUTLET", 740, 580, { room: "חדר רחצה" }),
  point("OUT-32", "OUTLET", 880, 700, { room: "חדר רחצה" }),
  point("OUT-33", "OUTLET", 940, 580, { room: "שירותי אורחים" }),
  point("OUT-34", "OUTLET", 250, -200, { room: "מרפסת שמש" }),
];

/** 12 נקודות תאורה בתוכנית הסטנדרט */
const LIGHTS: DrawingElement[] = [
  point("LGT-01", "LIGHT", 290, 220, { room: "סלון ופינת אוכל" }),
  point("LGT-02", "LIGHT", 150, 120, { room: "סלון ופינת אוכל" }),
  point("LGT-03", "LIGHT", 430, 320, { room: "סלון ופינת אוכל" }),
  point("LGT-04", "LIGHT", 740, 220, { room: "מטבח" }),
  point("LGT-05", "LIGHT", 700, 90, { room: "מטבח" }),
  point("LGT-06", "LIGHT", 1030, 220, { room: "ממ\"ד" }),
  point("LGT-07", "LIGHT", 300, 490, { room: "מסדרון" }),
  point("LGT-08", "LIGHT", 800, 490, { room: "מסדרון" }),
  point("LGT-09", "LIGHT", 220, 720, { room: "חדר שינה הורים" }),
  point("LGT-10", "LIGHT", 570, 720, { room: "חדר ילדים" }),
  point("LGT-11", "LIGHT", 810, 720, { room: "חדר רחצה" }),
  point("LGT-12", "LIGHT", 1030, 720, { room: "שירותי אורחים" }),
];

const SWITCHES: DrawingElement[] = [
  point("SW-01", "SWITCH", 140, 410, { room: "סלון ופינת אוכל" }),
  point("SW-02", "SWITCH", 650, 410, { room: "מטבח" }),
  point("SW-03", "SWITCH", 250, 530, { room: "מסדרון" }),
  point("SW-04", "SWITCH", 760, 530, { room: "מסדרון" }),
  point("SW-05", "SWITCH", 175, 570, { room: "חדר שינה הורים" }),
  point("SW-06", "SWITCH", 525, 570, { room: "חדר ילדים" }),
];

/** 6 נקודות מים */
const WATER: DrawingElement[] = [
  point("WTR-01", "WATER_POINT", 640, 60, { room: "מטבח", label: "נקודת מים — כיור מטבח" }),
  point("WTR-02", "WATER_POINT", 700, 60, { room: "מטבח", label: "נקודת מים — מדיח" }),
  point("WTR-03", "WATER_POINT", 760, 600, { room: "חדר רחצה", label: "נקודת מים — כיור" }),
  point("WTR-04", "WATER_POINT", 870, 620, { room: "חדר רחצה", label: "נקודת מים — מקלחת" }),
  point("WTR-05", "WATER_POINT", 1100, 600, { room: "שירותי אורחים", label: "נקודת מים — כיור" }),
  point("WTR-06", "WATER_POINT", 870, 380, { room: "מטבח", label: "נקודת מים — מכונת כביסה" }),
];

const SANITARY: DrawingElement[] = [
  el("SAN-01", "SANITARY", 820, 600, 60, 80, { label: "אסלה", gender: "f", room: "חדר רחצה" }),
  el("SAN-02", "SANITARY", 730, 780, 160, 70, { label: "אמבטיה", gender: "f", room: "חדר רחצה" }),
  el("SAN-03", "SANITARY", 735, 575, 70, 45, { label: "כיור רחצה", gender: "m", room: "חדר רחצה" }),
  el("SAN-04", "SANITARY", 1060, 790, 60, 80, {
    label: "אסלה",
    gender: "f",
    room: "שירותי אורחים",
  }),
  el("SAN-05", "SANITARY", 1070, 575, 60, 40, {
    label: "כיור שירותים",
    gender: "m",
    room: "שירותי אורחים",
  }),
];

const KITCHEN: DrawingElement[] = [
  el("KIT-01", "KITCHEN_UNIT", 600, 20, 290, 60, { label: "ארון מטבח תחתון", room: "מטבח" }),
  el("KIT-02", "KITCHEN_UNIT", 620, 28, 80, 45, { label: "כיור מטבח", room: "מטבח" }),
  el("KIT-03", "KITCHEN_UNIT", 760, 28, 70, 45, { label: "כיריים", room: "מטבח" }),
  el("KIT-04", "KITCHEN_UNIT", 830, 340, 70, 70, { label: "מקרר", room: "מטבח" }),
];

const HVAC: DrawingElement[] = [
  el("AC-01", "HVAC", 270, 55, 70, 26, { label: "מפזר מיזוג", room: "סלון ופינת אוכל" }),
  el("AC-02", "HVAC", 750, 55, 60, 26, { label: "מפזר מיזוג", room: "מטבח" }),
  el("AC-03", "HVAC", 190, 575, 60, 26, { label: "מפזר מיזוג", room: "חדר שינה הורים" }),
  el("AC-04", "HVAC", 550, 575, 60, 26, { label: "מפזר מיזוג", room: "חדר ילדים" }),
  el("AC-05", "HVAC", 600, 455, 130, 40, {
    label: "יחידת מיזוג מיני מרכזי",
    room: "מסדרון",
    notes: "גישה לתחזוקה מהמסדרון",
  }),
];

const COMMUNICATION: DrawingElement[] = [
  point("COM-01", "COMMUNICATION", 250, 40, {
    room: "סלון ופינת אוכל",
    label: "נקודת טלוויזיה",
  }),
  point("COM-02", "COMMUNICATION", 275, 40, { room: "סלון ופינת אוכל", label: "נקודת תקשורת" }),
  point("COM-03", "COMMUNICATION", 275, 580, { room: "חדר שינה הורים", label: "נקודת טלוויזיה" }),
];

function buildDocument(id: string, name: string, elements: DrawingElement[]): DrawingDocument {
  return {
    id,
    name,
    units: "CM",
    scale: 50,
    bounds: computeBounds(elements, 45),
    elements,
  };
}

/** גרסה 1 — תוכנית הסטנדרט של טיפוס 4 חדרים */
export function standardApartment42(): DrawingDocument {
  const elements = [
    ...ROOMS,
    ...STRUCTURAL_WALLS,
    ...PARTITIONS,
    ...RAILINGS,
    ...DOORS,
    ...WINDOWS,
    ...KITCHEN,
    ...SANITARY,
    ...HVAC,
    ...WATER,
    ...OUTLETS,
    ...SWITCHES,
    ...LIGHTS,
    ...COMMUNICATION,
  ];
  return buildDocument("plan-42-standard", "דירה 42 — תוכנית סטנדרט", elements);
}

/**
 * גרסה 2 — תוכנית השינויים של המעצבת.
 * 17 שינויים מול הסטנדרט: 7 שקעים נוספו, 3 שקעים הוזזו, קיר בוטל,
 * מחיצת גבס נוספה, אסלה הוזזה, נקודת מים במטבח הוזזה,
 * 2 נקודות תאורה נוספו ודלת אחת הוזזה.
 */
export function modifiedApartment42(): DrawingDocument {
  const base = standardApartment42();

  const elements = base.elements
    // 11. קיר הבלוק בין הסלון למטבח בוטל
    .filter((element) => element.id !== "W-01")
    .map((element) => {
      // 8–10. שלושה שקעים הוזזו
      if (element.id === "OUT-05") {
        return { ...element, y: element.y + 60 };
      }
      if (element.id === "OUT-13") {
        return { ...element, y: element.y + 70 };
      }
      if (element.id === "OUT-27") {
        return { ...element, x: element.x - 40 };
      }
      // 13. האסלה בחדר הרחצה הוזזה 70 ס"מ
      if (element.id === "SAN-01") {
        return {
          ...element,
          y: element.y + 70,
          metadata: { ...element.metadata, detectionConfidence: 0.88 },
        };
      }
      // 14. נקודת מים במטבח הוזזה אל האי החדש
      if (element.id === "WTR-01") {
        return {
          ...element,
          x: 700 - 9,
          y: 300 - 9,
          metadata: { ...element.metadata, detectionConfidence: 0.91 },
        };
      }
      // 17. דלת חדר הילדים הוזזה
      if (element.id === "D-06") {
        return { ...element, x: element.x + 110 };
      }
      return element;
    });

  const added: DrawingElement[] = [
    // 12. מחיצת גבס חדשה ליצירת פינת עבודה בסלון
    el("P-01", "PARTITION", 300, 140, 20, 280, {
      tag: "P01",
      material: "גבס",
      structural: false,
      room: "סלון ופינת אוכל",
      lengthM: 2.8,
      notes: "מחיצה ליצירת פינת עבודה",
    }),
    // 1–7. שבעה שקעים נוספו
    point("OUT-35", "OUTLET", 335, 200, { room: "סלון ופינת אוכל" }),
    point("OUT-36", "OUTLET", 335, 330, { room: "סלון ופינת אוכל" }),
    point("OUT-37", "OUTLET", 700, 250, { room: "מטבח" }),
    point("OUT-38", "OUTLET", 760, 250, { room: "מטבח" }),
    point("OUT-39", "OUTLET", 300, 865, { room: "חדר שינה הורים" }),
    point("OUT-40", "OUTLET", 680, 700, { room: "חדר ילדים" }),
    point("OUT-41", "OUTLET", 560, 460, { room: "מסדרון" }),
    // 15–16. שתי נקודות תאורה נוספו
    point("LGT-13", "LIGHT", 350, 100, { room: "סלון ופינת אוכל" }),
    point("LGT-14", "LIGHT", 730, 300, { room: "מטבח" }),
  ];

  return buildDocument("plan-42-modified", "דירה 42 — תוכנית שינויים", [...elements, ...added]);
}

/** תוכנית סטנדרט גנרית לטיפוסים אחרים — משמשת דירות ללא שינויים */
export function standardPlanForType(typeName: string): DrawingDocument {
  const document = standardApartment42();
  return { ...document, id: `plan-${typeName}`, name: `${typeName} — תוכנית סטנדרט` };
}
