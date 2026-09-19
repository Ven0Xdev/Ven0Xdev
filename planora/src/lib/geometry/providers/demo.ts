/**
 * מעבד הגאומטריה הפעיל.
 *
 * הוא אינו קורא DWG, DXF, PDF, RVT או IFC. הוא מתרגם `DrawingDocument` —
 * מודל השרטוט המנורמל של המערכת — לגאומטריה תלת-ממדית.
 *
 * זה מספיק כדי שהארכיטקטורה תהיה נכונה: **הרנדרר אינו יודע מאיפה הגיעה
 * הדירה.** כשייכתב מעבד DWG אמיתי, הוא יחליף את המעבד הזה בלי שינוי בתצוגה.
 *
 * המרה: סנטימטרים → מטרים, וצירי שרטוט (x ימינה, y מטה) → צירי סצנה
 * (x ימינה, z קדימה).
 */

import type { DrawingDocument, DrawingElement } from "@/lib/drawing/types";
import type {
  ApartmentGeometryProvider,
  ApprovedGeometryChange,
  CreateGeometryVersionInput,
  GenerateGeometryInput,
  GeometryProviderId,
  LoadFromBimInput,
  LoadFromPlanInput,
} from "../provider";
import {
  GeometryUnsupportedError,
  type ApartmentGeometry,
  type BalconyGeometry,
  type CeilingGeometry,
  type FixtureGeometry,
  type FloorGeometry,
  type GeometryBounds,
  type GeometrySourceFormat,
  type GeometryValidationIssue,
  type OpeningGeometry,
  type RoomGeometry,
  type RoomKind,
  type Vec2,
  type WallGeometry,
} from "../types";

const CM_TO_M = 0.01;
/** גובה חלל פנימי סטנדרטי */
const CEILING_HEIGHT_M = 2.7;
const RAILING_HEIGHT_M = 1.05;
const WALL_THICKNESS_FALLBACK_M = 0.1;

/** זיהוי סוג החדר מהתווית בתוכנית */
const ROOM_KIND_RULES: [RegExp, RoomKind][] = [
  [/ממ"?ד|ממד/, "SAFE_ROOM"],
  [/מרפסת|גג|גינה/, "BALCONY"],
  [/מטבח/, "KITCHEN"],
  // "סלון ופינת אוכל" הוא חלל מגורים אחד. הבדיקה לסלון קודמת בכוונה, אחרת
  // החלל המרכזי בדירה היה מסווג כפינת אוכל.
  [/סלון/, "LIVING"],
  [/פינת אוכל/, "DINING"],
  [/רחצה|אמבט|שירות/, "BATHROOM"],
  [/שינה|ילדים|הורים/, "BEDROOM"],
  [/מסדרון|כניסה|פרוזדור/, "CORRIDOR"],
  [/מחסן|ארונות/, "STORAGE"],
];

function roomKindFromLabel(label: string): RoomKind {
  for (const [pattern, kind] of ROOM_KIND_RULES) {
    if (pattern.test(label)) return kind;
  }
  return "OTHER";
}

function m(valueCm: number): number {
  return Math.round(valueCm * CM_TO_M * 1000) / 1000;
}

/** מלבן האלמנט בצירי הסצנה */
function rect(element: DrawingElement) {
  const width = m(element.width);
  const depth = m(element.height);
  const x = m(element.x);
  const z = m(element.y);
  return { x, z, width, depth, center: { x: x + width / 2, z: z + depth / 2 } satisfies Vec2 };
}

function outlineOf(element: DrawingElement): Vec2[] {
  const { x, z, width, depth } = rect(element);
  return [
    { x, z },
    { x: x + width, z },
    { x: x + width, z: z + depth },
    { x, z: z + depth },
  ];
}

function label(element: DrawingElement): string {
  return (element.metadata?.label as string | undefined) ?? "";
}

function boundsOf(rooms: RoomGeometry[], walls: WallGeometry[]): GeometryBounds {
  const points: Vec2[] = [
    ...rooms.flatMap((room) => room.outline),
    ...walls.flatMap((wall) => [wall.start, wall.end]),
  ];

  if (points.length === 0) {
    const zero: Vec2 = { x: 0, z: 0 };
    return { min: zero, max: zero, center: zero, sizeX: 0, sizeZ: 0 };
  }

  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const min: Vec2 = { x: Math.min(...xs), z: Math.min(...zs) };
  const max: Vec2 = { x: Math.max(...xs), z: Math.max(...zs) };

  return {
    min,
    max,
    center: { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 },
    sizeX: max.x - min.x,
    sizeZ: max.z - min.z,
  };
}

export class DemoGeometryProvider implements ApartmentGeometryProvider {
  readonly id: GeometryProviderId = "demo";
  readonly label = "מעבד הדגמה (מתוכנית מעובדת)";
  readonly supportedFormats: GeometrySourceFormat[] = ["DEMO", "MANUAL"];

  async loadFromPlan(input: LoadFromPlanInput): Promise<ApartmentGeometry> {
    return this.fromDocument(input);
  }

  async loadFromBIM(input: LoadFromBimInput): Promise<ApartmentGeometry> {
    throw new GeometryUnsupportedError(
      `קריאת קובץ ${input.format} אינה נתמכת עדיין. נדרש מעבד ייעודי לפורמט הזה.`,
    );
  }

  async generateGeometry(input: GenerateGeometryInput): Promise<ApartmentGeometry> {
    // דירה נגזרת מטיפוס הבסיס. 40 דירות ו-6 טיפוסים = 6 גאומטריות, לא 40.
    const base = input.base;
    const geometry: ApartmentGeometry = {
      ...base,
      id: `${base.id}:${input.apartmentId}`,
      apartmentId: input.apartmentId,
      rooms: input.override?.rooms ?? base.rooms,
      walls: input.override?.walls ?? base.walls,
      openings: input.override?.openings ?? base.openings,
      balconies: input.override?.balconies ?? base.balconies,
    };

    return this.createGeometryVersion(geometry, {
      createdBy: input.createdBy ?? null,
      isOverride: Boolean(input.override),
      note: input.note ?? null,
    });
  }

  getRooms(geometry: ApartmentGeometry): RoomGeometry[] {
    return geometry.rooms;
  }

  getWalls(geometry: ApartmentGeometry): WallGeometry[] {
    return geometry.walls;
  }

  getOpenings(geometry: ApartmentGeometry): OpeningGeometry[] {
    return geometry.openings;
  }

  getDoors(geometry: ApartmentGeometry): OpeningGeometry[] {
    return geometry.openings.filter(
      (opening) => opening.kind === "DOOR" || opening.kind === "SLIDING_DOOR",
    );
  }

  getWindows(geometry: ApartmentGeometry): OpeningGeometry[] {
    return geometry.openings.filter((opening) => opening.kind === "WINDOW");
  }

  getBalconies(geometry: ApartmentGeometry): BalconyGeometry[] {
    return geometry.balconies;
  }

  getFloors(geometry: ApartmentGeometry): FloorGeometry[] {
    return geometry.floors;
  }

  getCeilings(geometry: ApartmentGeometry): CeilingGeometry[] {
    return geometry.ceilings;
  }

  applyApprovedChanges(
    geometry: ApartmentGeometry,
    changes: ApprovedGeometryChange[],
  ): ApartmentGeometry {
    if (changes.length === 0) return geometry;

    let walls = [...geometry.walls];
    let openings = [...geometry.openings];

    for (const change of changes) {
      switch (change.operation) {
        case "MOVE_WALL":
          walls = walls.map((wall) =>
            wall.id === change.targetId
              ? {
                  ...wall,
                  start: {
                    x: wall.start.x + (change.deltaX ?? 0),
                    z: wall.start.z + (change.deltaZ ?? 0),
                  },
                  end: {
                    x: wall.end.x + (change.deltaX ?? 0),
                    z: wall.end.z + (change.deltaZ ?? 0),
                  },
                }
              : wall,
          );
          break;

        case "REMOVE_WALL":
          // קיר נושא אינו מוסר גם כאשר הגיע לכאן שינוי מאושר — זו בדיקת בטיחות
          // אחרונה, לא החלטה מקצועית.
          walls = walls.filter(
            (wall) => wall.id !== change.targetId || wall.structural,
          );
          break;

        case "ADD_WALL":
          if (change.wall) walls = [...walls, change.wall];
          break;

        case "MOVE_OPENING":
          openings = openings.map((opening) =>
            opening.id === change.targetId
              ? {
                  ...opening,
                  center: {
                    x: opening.center.x + (change.deltaX ?? 0),
                    z: opening.center.z + (change.deltaZ ?? 0),
                  },
                }
              : opening,
          );
          break;

        case "RESIZE_ROOM":
          // שינוי מתאר חדר מגיע מתוכנית מעודכנת, לא מהזזת נקודות כאן.
          break;
      }
    }

    return this.createGeometryVersion(
      { ...geometry, walls, openings, bounds: boundsOf(geometry.rooms, walls) },
      { appliedChangeIds: changes.map((change) => change.changeItemId) },
    );
  }

  createGeometryVersion(
    geometry: ApartmentGeometry,
    input: CreateGeometryVersionInput,
  ): ApartmentGeometry {
    const versionNo = geometry.version.versionNo + 1;
    return {
      ...geometry,
      version: {
        id: `${geometry.id}:v${versionNo}`,
        versionNo,
        source: input.source ?? geometry.version.source,
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy ?? geometry.version.createdBy ?? null,
        appliedChangeIds: [
          ...geometry.version.appliedChangeIds,
          ...(input.appliedChangeIds ?? []),
        ],
        isOverride: input.isOverride ?? geometry.version.isOverride,
        note: input.note ?? null,
      },
    };
  }

  validateGeometry(geometry: ApartmentGeometry): GeometryValidationIssue[] {
    const issues: GeometryValidationIssue[] = [];

    if (geometry.rooms.length === 0) {
      issues.push({
        code: "NO_ROOMS",
        severity: "ERROR",
        message: "לא זוהו חדרים בתוכנית. לא ניתן לבנות תצוגה תלת-ממדית.",
      });
    }

    for (const room of geometry.rooms) {
      if (room.outline.length < 3) {
        issues.push({
          code: "ROOM_NOT_CLOSED",
          severity: "ERROR",
          message: `מתאר החדר "${room.label}" אינו סגור.`,
          elementId: room.id,
        });
      }

      // שטח לא סביר מעיד לרוב על קנה מידה שגוי בקובץ המקור
      if (room.areaSqm > 0 && (room.areaSqm < 1 || room.areaSqm > 200)) {
        issues.push({
          code: "IMPLAUSIBLE_ROOM_AREA",
          severity: "WARNING",
          message: `שטח החדר "${room.label}" הוא ${room.areaSqm} מ"ר — יש לוודא את קנה המידה.`,
          elementId: room.id,
        });
      }

      if (room.ceilingHeightM < 2.2 || room.ceilingHeightM > 4.5) {
        issues.push({
          code: "IMPLAUSIBLE_CEILING_HEIGHT",
          severity: "WARNING",
          message: `גובה התקרה בחדר "${room.label}" הוא ${room.ceilingHeightM} מ'.`,
          elementId: room.id,
        });
      }
    }

    const indoorRooms = geometry.rooms.filter((room) => !room.isOutdoor);
    if (indoorRooms.length > 0 && this.getDoors(geometry).length === 0) {
      issues.push({
        code: "MISSING_DOOR",
        severity: "WARNING",
        message: "לא זוהו דלתות בתוכנית.",
      });
    }

    const { min, max } = geometry.bounds;
    for (const opening of geometry.openings) {
      const outside =
        opening.center.x < min.x - 1 ||
        opening.center.x > max.x + 1 ||
        opening.center.z < min.z - 1 ||
        opening.center.z > max.z + 1;
      if (outside) {
        issues.push({
          code: "OPENING_OUTSIDE_BOUNDS",
          severity: "WARNING",
          message: `הפתח "${opening.label}" נמצא מחוץ לגבולות הדירה.`,
          elementId: opening.id,
        });
      }
    }

    return issues;
  }

  // -------------------------------------------------------------------------

  private fromDocument(input: LoadFromPlanInput): ApartmentGeometry {
    const document: DrawingDocument = input.document;

    const rooms: RoomGeometry[] = [];
    const walls: WallGeometry[] = [];
    const openings: OpeningGeometry[] = [];
    const floors: FloorGeometry[] = [];
    const ceilings: CeilingGeometry[] = [];
    const balconies: BalconyGeometry[] = [];
    const fixtures: FixtureGeometry[] = [];

    for (const element of document.elements) {
      switch (element.type) {
        case "ROOM": {
          const text = label(element);
          const kind = roomKindFromLabel(text);
          const isOutdoor = kind === "BALCONY";
          const geo = rect(element);
          const outline = outlineOf(element);

          rooms.push({
            id: element.id,
            label: text,
            kind,
            outline,
            center: geo.center,
            areaSqm: Math.round(geo.width * geo.depth * 10) / 10,
            isOutdoor,
            ceilingHeightM: CEILING_HEIGHT_M,
          });

          floors.push({
            id: `${element.id}:floor`,
            roomId: element.id,
            outline,
            levelM: 0,
            thicknessM: 0.09,
            isOutdoor,
          });

          ceilings.push({
            id: `${element.id}:ceiling`,
            roomId: element.id,
            heightM: CEILING_HEIGHT_M,
            kind: "FLAT",
          });

          if (isOutdoor) {
            balconies.push({
              id: `${element.id}:balcony`,
              roomId: element.id,
              outline,
              railingHeightM: RAILING_HEIGHT_M,
              directionDeg: null,
            });
          }
          break;
        }

        case "WALL":
        case "PARTITION":
        case "RAILING": {
          const geo = rect(element);
          const horizontal = geo.width >= geo.depth;
          const thickness = Math.max(
            horizontal ? geo.depth : geo.width,
            WALL_THICKNESS_FALLBACK_M,
          );

          walls.push({
            id: element.id,
            kind:
              element.type === "WALL"
                ? "STRUCTURAL"
                : element.type === "PARTITION"
                  ? "PARTITION"
                  : "RAILING",
            start: horizontal
              ? { x: geo.x, z: geo.center.z }
              : { x: geo.center.x, z: geo.z },
            end: horizontal
              ? { x: geo.x + geo.width, z: geo.center.z }
              : { x: geo.center.x, z: geo.z + geo.depth },
            thicknessM: thickness,
            heightM: element.type === "RAILING" ? RAILING_HEIGHT_M : CEILING_HEIGHT_M,
            structural: element.type === "WALL" && element.metadata?.structural !== false,
            roomIds: element.metadata?.room ? [String(element.metadata.room)] : [],
          });
          break;
        }

        case "DOOR":
        case "WINDOW":
        case "SLIDING_DOOR": {
          const geo = rect(element);
          const isWindow = element.type === "WINDOW";
          const isSliding = element.type === "SLIDING_DOOR";

          openings.push({
            id: element.id,
            kind: element.type,
            label: label(element),
            center: geo.center,
            widthM: Math.max(geo.width, geo.depth),
            depthM: Math.min(geo.width, geo.depth),
            // אדן חלון בגובה מקובל; דלת הזזה יוצאת כמעט מהרצפה
            sillHeightM: isWindow ? 0.9 : isSliding ? 0.04 : 0,
            heightM: isWindow ? 1.35 : 2.1,
            rotationRad: (element.rotation * Math.PI) / 180,
            wallId: null,
            roomIds: element.metadata?.room ? [String(element.metadata.room)] : [],
          });
          break;
        }

        case "KITCHEN_UNIT": {
          const text = label(element);
          const geo = rect(element);
          // ארון תחתון וכיריים נושאים משטח עבודה; שאר היחידות הן חזית
          const isCounter = text.includes("ארון") || text.includes("כיריים");

          fixtures.push({
            id: element.id,
            kind: isCounter ? "KITCHEN_COUNTER" : "KITCHEN_CABINET",
            label: text,
            center: geo.center,
            widthM: geo.width,
            depthM: geo.depth,
            heightM: isCounter ? 0.9 : 0.85,
            rotationRad: (element.rotation * Math.PI) / 180,
            roomId: element.metadata?.room ? String(element.metadata.room) : null,
          });
          break;
        }

        case "SANITARY": {
          const geo = rect(element);
          fixtures.push({
            id: element.id,
            kind: "SANITARY",
            label: label(element),
            center: geo.center,
            widthM: geo.width,
            depthM: geo.depth,
            heightM: 0.45,
            rotationRad: (element.rotation * Math.PI) / 180,
            roomId: element.metadata?.room ? String(element.metadata.room) : null,
          });
          break;
        }

        default:
          // נקודות חשמל, מים ותקשורת אינן גאומטריה — הן נספרות בהשוואה.
          break;
      }
    }

    return {
      id: `geometry:${input.planVersionId ?? document.id}`,
      apartmentId: input.apartmentId ?? null,
      apartmentTypeId: input.apartmentTypeId ?? null,
      projectId: input.projectId ?? null,
      version: {
        id: `geometry:${input.planVersionId ?? document.id}:v1`,
        versionNo: 1,
        source: {
          format: "DEMO",
          planId: input.planId ?? null,
          planVersionId: input.planVersionId ?? null,
          fileName: document.name,
          warnings: [],
        },
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy ?? null,
        appliedChangeIds: [],
        isOverride: false,
        note: null,
      },
      bounds: boundsOf(rooms, walls),
      rooms,
      walls,
      openings,
      floors,
      ceilings,
      balconies,
      fixtures,
    };
  }
}
