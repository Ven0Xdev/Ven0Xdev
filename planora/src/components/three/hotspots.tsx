"use client";

import { useMemo, useState } from "react";
import { Html } from "@react-three/drei";

import type { SceneBox, SceneModel } from "@/lib/three/scene-model";
import { cn } from "@/lib/utils";

/**
 * נקודות בחירה בתוך הסצנה.
 *
 * הדייר לוחץ על המטבח בדירה שלו, לא על שורה ברשימה. הנקודות עדינות במכוון —
 * הן מסמנות מה ניתן לשנות בלי להסתיר את החלל.
 *
 * **נקודה מופיעה רק אם יש לה מוצרים זמינים בפרויקט.** אין נקודה שנפתחת
 * לרשימה ריקה, ואין נקודה למשהו שלא ניתן לבחור.
 */

export interface HotspotTarget {
  /** הקטגוריה בקטלוג שנפתחת בלחיצה */
  category: string;
  /** מה הדייר רואה — "משטח עבודה" ולא "KITCHEN" */
  label: string;
  position: [number, number, number];
}

/** מה בסצנה מייצג כל נקודה, ולאיזו קטגוריה בקטלוג היא שייכת */
const HOTSPOT_SOURCES: {
  label: string;
  category: string;
  /** האם התיבה מתאימה לשמש עוגן לנקודה הזו */
  match: (box: SceneBox) => boolean;
  /** גובה הסימון מעל העוגן */
  lift: number;
}[] = [
  {
    label: "ריצוף",
    category: "FLOORING",
    match: (box) => box.materialSlot === "interiorFloor",
    lift: 0.35,
  },
  {
    label: "מטבח",
    category: "KITCHEN",
    match: (box) => box.materialSlot === "kitchenFront",
    lift: 0.5,
  },
  {
    label: "משטח עבודה",
    category: "KITCHEN",
    match: (box) => box.materialSlot === "countertop",
    lift: 0.45,
  },
  {
    label: "כלים סניטריים",
    category: "SANITARY",
    match: (box) => box.materialSlot === "sanitary",
    lift: 0.4,
  },
  {
    label: "דלתות",
    category: "DOORS",
    match: (box) => box.kind === "DOOR",
    lift: 0.55,
  },
  {
    label: "מרפסת",
    category: "OUTDOOR",
    match: (box) => box.materialSlot === "outdoorFloor",
    lift: 0.4,
  },
];

function footprint(box: SceneBox): number {
  return box.size[0] * box.size[2];
}

export function Hotspots({
  model,
  availableCategories,
  selectedCategory,
  onSelect,
}: {
  model: SceneModel;
  /** הקטגוריות שיש להן מוצרים זמינים לדירה הזו */
  availableCategories: string[];
  selectedCategory: string | null;
  onSelect: (category: string, label: string) => void;
}) {
  const targets = useMemo<HotspotTarget[]>(() => {
    const result: HotspotTarget[] = [];

    for (const source of HOTSPOT_SOURCES) {
      if (!availableCategories.includes(source.category)) continue;

      // העוגן הוא המשטח הגדול ביותר מסוגו — הוא גם הקריא ביותר בתצוגה
      const anchor = model.boxes
        .filter(source.match)
        .sort((a, b) => footprint(b) - footprint(a))[0];
      if (!anchor) continue;

      result.push({
        category: source.category,
        label: source.label,
        position: [
          anchor.position[0],
          anchor.position[1] + anchor.size[1] / 2 + source.lift,
          anchor.position[2],
        ],
      });
    }

    return result;
  }, [model.boxes, availableCategories]);

  return (
    <>
      {targets.map((target) => (
        <Hotspot
          key={`${target.category}:${target.label}`}
          target={target}
          active={selectedCategory === target.category}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function Hotspot({
  target,
  active,
  onSelect,
}: {
  target: HotspotTarget;
  active: boolean;
  onSelect: (category: string, label: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Html position={target.position} center distanceFactor={11} zIndexRange={[24, 12]}>
      <button
        type="button"
        onClick={() => onSelect(target.category, target.label)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        aria-label={`בחירת ${target.label}`}
        className={cn(
          "flex items-center gap-1.5 rounded-pill border px-1 py-1 shadow-card backdrop-blur-sm transition-all",
          active || hovered
            ? "border-brand-600 bg-brand-600 pe-2.5 text-white"
            : "border-white/70 bg-white/85 text-ink-soft",
        )}
      >
        <span
          className={cn(
            "block size-2.5 shrink-0 rounded-full ring-2 transition-colors",
            active || hovered ? "bg-white ring-white/40" : "bg-brand-600 ring-brand-600/25",
          )}
        />
        {active || hovered ? (
          <span className="text-[11px] font-medium whitespace-nowrap">{target.label}</span>
        ) : null}
      </button>
    </Html>
  );
}
