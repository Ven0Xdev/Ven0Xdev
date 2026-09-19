/**
 * טיפוסי דירות שונים — גאומטריה שונה.
 *
 * זו הבדיקה שמוכיחה את הטענה המרכזית: התצוגה נבנית מהתוכנית של הדירה.
 * אם שתי דירות מטיפוסים שונים היו מייצרות אותה גאומטריה, כל השאר הוא קישוט.
 */

import { describe, expect, it } from "vitest";

import {
  DEMO_APARTMENT_TYPES,
  buildApartmentTypePlan,
  modifiedPlanForApartmentType,
  planForApartmentType,
} from "@/lib/drawing/demo/apartment-types";
import { DemoGeometryProvider } from "@/lib/geometry/providers/demo";
import type { ApartmentGeometry } from "@/lib/geometry/types";

const provider = new DemoGeometryProvider();

async function geometryFor(typeName: string): Promise<ApartmentGeometry> {
  return provider.loadFromPlan({
    document: planForApartmentType(typeName),
    apartmentTypeId: typeName,
  });
}

describe("שלושה טיפוסים, שלוש דירות שונות", () => {
  it("מספר חדרי השינה שונה בין הטיפוסים", async () => {
    const small = await geometryFor("טיפוס 3 חדרים");
    const medium = await geometryFor("טיפוס 4 חדרים");
    const large = await geometryFor("טיפוס 5 חדרים");

    const bedrooms = (geometry: ApartmentGeometry) =>
      geometry.rooms.filter((room) => room.kind === "BEDROOM").length;

    expect(bedrooms(small)).toBe(2);
    expect(bedrooms(medium)).toBe(3);
    expect(bedrooms(large)).toBe(4);
  });

  it("המעטפת גדלה עם הטיפוס", async () => {
    const small = await geometryFor("טיפוס 3 חדרים");
    const large = await geometryFor("טיפוס 5 חדרים");

    expect(large.bounds.sizeX).toBeGreaterThan(small.bounds.sizeX);
  });

  it("הקירות והפתחים שונים — לא רק השם", async () => {
    const small = await geometryFor("טיפוס 3 חדרים");
    const large = await geometryFor("טיפוס 5 חדרים");

    expect(large.walls.length).toBeGreaterThan(small.walls.length);
    expect(large.openings.length).toBeGreaterThan(small.openings.length);
    expect(JSON.stringify(large.rooms)).not.toBe(JSON.stringify(small.rooms));
  });

  it("המרפסת גדלה עם הטיפוס", async () => {
    const small = await geometryFor("טיפוס 3 חדרים");
    const large = await geometryFor("טיפוס 5 חדרים");

    const balconyArea = (geometry: ApartmentGeometry) =>
      geometry.rooms.find((room) => room.isOutdoor)?.areaSqm ?? 0;

    expect(balconyArea(small)).toBeGreaterThan(0);
    expect(balconyArea(large)).toBeGreaterThan(balconyArea(small));
    expect(small.balconies).toHaveLength(1);
    expect(large.balconies).toHaveLength(1);
  });

  it("כל טיפוס עובר את בדיקת התקינות", async () => {
    for (const spec of DEMO_APARTMENT_TYPES) {
      const geometry = await provider.loadFromPlan({
        document: buildApartmentTypePlan(spec),
      });
      const errors = provider
        .validateGeometry(geometry)
        .filter((issue) => issue.severity === "ERROR");

      expect(errors, spec.name).toHaveLength(0);
      // כל דירה סגורה: יש לה ממ"ד, מטבח, חדר רחצה ומרפסת
      const kinds = new Set(geometry.rooms.map((room) => room.kind));
      expect(kinds.has("SAFE_ROOM"), spec.name).toBe(true);
      expect(kinds.has("KITCHEN"), spec.name).toBe(true);
      expect(kinds.has("BATHROOM"), spec.name).toBe(true);
      expect(kinds.has("BALCONY"), spec.name).toBe(true);
    }
  });

  it("טיפוס לא מוכר אינו מפיל את התצוגה", () => {
    expect(planForApartmentType("טיפוס שלא קיים").elements.length).toBeGreaterThan(0);
  });
});

describe("תוכנית שינויים של אותו טיפוס", () => {
  it("מתארת את אותה דירה — לא דירה אחרת", async () => {
    const standard = await geometryFor("טיפוס 4 חדרים");
    const modified = await provider.loadFromPlan({
      document: modifiedPlanForApartmentType("טיפוס 4 חדרים"),
    });

    // אותו מספר חדרים ואותה מעטפת: השינויים הם בתוך הדירה
    expect(modified.rooms).toHaveLength(standard.rooms.length);
    expect(modified.bounds.sizeX).toBeCloseTo(standard.bounds.sizeX, 2);

    // ובכל זאת — משהו באמת זז
    expect(JSON.stringify(modified.walls)).not.toBe(JSON.stringify(standard.walls));
  });
});
