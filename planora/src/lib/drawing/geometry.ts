import type { DrawingBounds, DrawingElement, DrawingDocument } from "./types";

export function center(element: DrawingElement): { x: number; y: number } {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

export function distance(a: DrawingElement, b: DrawingElement): number {
  const ca = center(a);
  const cb = center(b);
  return Math.round(Math.hypot(ca.x - cb.x, ca.y - cb.y));
}

/** אורך אלמנט קווי (קיר / מחיצה) במטרים */
export function lengthInMeters(element: DrawingElement): number {
  const explicit = element.metadata?.lengthM;
  if (typeof explicit === "number") return explicit;
  return Math.round((Math.max(element.width, element.height) / 100) * 100) / 100;
}

export function areaInSqm(element: DrawingElement): number {
  return Math.round(((element.width * element.height) / 10000) * 100) / 100;
}

export function computeBounds(elements: DrawingElement[], margin = 60): DrawingBounds {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, width: 100, height: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + element.height);
  }

  return {
    minX: minX - margin,
    minY: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}

export function viewBoxOf(bounds: DrawingBounds): string {
  return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
}

/** מאתר את החדר שמכיל את מרכז האלמנט */
export function roomOf(document: DrawingDocument, element: DrawingElement): string | undefined {
  const explicit = element.metadata?.room;
  if (typeof explicit === "string") return explicit;

  const point = center(element);
  const room = document.elements.find(
    (candidate) =>
      candidate.type === "ROOM" &&
      point.x >= candidate.x &&
      point.x <= candidate.x + candidate.width &&
      point.y >= candidate.y &&
      point.y <= candidate.y + candidate.height,
  );
  return room?.metadata?.label;
}

export function elementById(document: DrawingDocument, id: string): DrawingElement | undefined {
  return document.elements.find((element) => element.id === id);
}
