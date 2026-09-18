"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import type { ChangeType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import type { DrawingDocument, DrawingElement } from "@/lib/drawing/types";
import { cn } from "@/lib/utils";
import { DRAW_ORDER, ElementShape } from "./element-shape";

export type ViewerMode = "STANDARD" | "MODIFIED" | "COMPARE";

export interface ViewerChange {
  id: string;
  code: string;
  elementId: string;
  type: ChangeType;
  description: string;
}

export const CHANGE_COLORS: Record<ChangeType, string> = {
  ADDED: "var(--color-change-added)",
  REMOVED: "var(--color-change-removed)",
  MOVED: "var(--color-change-moved)",
  MODIFIED: "var(--color-change-moved)",
  UNKNOWN: "var(--color-change-unknown)",
};

interface PlanViewerProps {
  standard: DrawingDocument;
  modified?: DrawingDocument | null;
  mode: ViewerMode;
  changes?: ViewerChange[];
  selectedChangeId?: string | null;
  onSelectChange?: (changeId: string | null) => void;
  className?: string;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 6;

export function PlanViewer({
  standard,
  modified,
  mode,
  changes = [],
  selectedChangeId,
  onSelectChange,
  className,
}: PlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [hoveredChangeId, setHoveredChangeId] = useState<string | null>(null);
  const dragState = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const activeDocument = mode === "STANDARD" ? standard : (modified ?? standard);
  const bounds = activeDocument.bounds;

  const changeByElementId = useMemo(() => {
    const map = new Map<string, ViewerChange>();
    for (const change of changes) map.set(change.elementId, change);
    return map;
  }, [changes]);

  /** במצב השוואה מציגים את הסטנדרט ברקע ואת תוכנית השינויים מעליו */
  const layers = useMemo(() => {
    if (mode !== "COMPARE" || !modified) {
      return { base: null as DrawingDocument | null, top: activeDocument };
    }
    return { base: standard, top: modified };
  }, [mode, modified, standard, activeDocument]);

  const removedElements = useMemo(() => {
    if (mode !== "COMPARE" || !modified) return [];
    const modifiedIds = new Set(modified.elements.map((element) => element.id));
    return standard.elements.filter(
      (element) => element.type !== "ROOM" && !modifiedIds.has(element.id),
    );
  }, [mode, modified, standard]);

  const fit = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  // מעבר בין מצבי תצוגה מאפס את הזום וההזזה
  const [renderedMode, setRenderedMode] = useState(mode);
  if (renderedMode !== mode) {
    setRenderedMode(mode);
    setTransform({ scale: 1, x: 0, y: 0 });
  }

  function zoomBy(factor: number) {
    setTransform((current) => ({
      ...current,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor)),
    }));
  }

  function onWheel(event: React.WheelEvent) {
    if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 30) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragState.current = {
      x: event.clientX,
      y: event.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = dragState.current;
    if (!state) return;
    setTransform((current) => ({
      ...current,
      x: state.tx + (event.clientX - state.x),
      y: state.ty + (event.clientY - state.y),
    }));
  }

  function onPointerUp() {
    dragState.current = null;
  }

  const sortedTop = useMemo(
    () =>
      [...layers.top.elements].sort(
        (a, b) => (DRAW_ORDER[a.type] ?? 5) - (DRAW_ORDER[b.type] ?? 5),
      ),
    [layers.top],
  );

  function renderElement(element: DrawingElement, options: { ghost?: boolean } = {}) {
    const change = mode === "COMPARE" ? changeByElementId.get(element.id) : undefined;
    const isSelected = change ? change.id === selectedChangeId : false;
    const isHovered = change ? change.id === hoveredChangeId : false;
    const accent = change ? CHANGE_COLORS[change.type] : undefined;

    const shape = (
      <ElementShape
        element={element}
        accent={options.ghost ? "var(--color-change-removed)" : accent}
        muted={options.ghost}
      />
    );

    if (!change || !onSelectChange) {
      return <g key={`${element.id}-${options.ghost ? "ghost" : "main"}`}>{shape}</g>;
    }

    return (
      <g
        key={element.id}
        role="button"
        tabIndex={0}
        aria-label={`${change.code} — ${change.description}`}
        className="cursor-pointer outline-none"
        onClick={(event) => {
          event.stopPropagation();
          onSelectChange(change.id === selectedChangeId ? null : change.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectChange(change.id);
          }
        }}
        onMouseEnter={() => setHoveredChangeId(change.id)}
        onMouseLeave={() => setHoveredChangeId(null)}
      >
        {(isSelected || isHovered) && (
          <ChangeHalo element={element} color={accent ?? "#000"} strong={isSelected} />
        )}
        {shape}
      </g>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
    >
      <div
        ref={containerRef}
        className="bg-blueprint h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={() => onSelectChange?.(null)}
      >
        <svg
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          className="h-full w-full"
          role="img"
          aria-label={activeDocument.name}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "center",
          }}
        >
          {/* שכבת הרקע במצב השוואה — תוכנית הסטנדרט */}
          {layers.base ? (
            <g opacity={0.3}>
              {[...layers.base.elements]
                .sort((a, b) => (DRAW_ORDER[a.type] ?? 5) - (DRAW_ORDER[b.type] ?? 5))
                .map((element) => (
                  <g key={`base-${element.id}`}>
                    <ElementShape element={element} muted />
                  </g>
                ))}
            </g>
          ) : null}

          {/* אלמנטים שבוטלו — מוצגים באדום מקווקו */}
          {removedElements.map((element) => renderElement(element, { ghost: true }))}

          {sortedTop.map((element) => renderElement(element))}

          {/* שמות החללים מצוירים אחרונים כדי שיישארו קריאים מעל הסמלים */}
          <g>
            {layers.top.elements
              .filter((element) => element.type === "ROOM")
              .map((element) => (
                <RoomLabel key={`label-${element.id}`} element={element} />
              ))}
          </g>
        </svg>
      </div>

      {/* פקדי תצוגה */}
      <div className="absolute bottom-3 start-3 flex items-center gap-1 rounded-control border border-line bg-surface/95 p-1 shadow-card backdrop-blur-sm">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => zoomBy(1.2)}
          aria-label="הגדלה"
          title="הגדלה"
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => zoomBy(1 / 1.2)}
          aria-label="הקטנה"
          title="הקטנה"
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={fit}
          aria-label="התאמה למסך"
          title="התאמה למסך"
        >
          <Maximize2 />
        </Button>
        <span className="font-numeric px-1.5 text-[11px] text-ink-muted">
          {Math.round(transform.scale * 100)}%
        </span>
      </div>

      {(transform.scale !== 1 || transform.x !== 0 || transform.y !== 0) && (
        <button
          type="button"
          onClick={fit}
          className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-control border border-line bg-surface/95 px-2.5 py-1.5 text-[11px] text-ink-muted shadow-card backdrop-blur-sm transition-colors hover:text-ink"
        >
          <RotateCcw className="size-3" aria-hidden />
          איפוס תצוגה
        </button>
      )}
    </div>
  );
}

function RoomLabel({ element }: { element: DrawingElement }) {
  const label = element.metadata?.label;
  if (typeof label !== "string") return null;
  const areaLabel = element.metadata?.areaLabel;

  return (
    <g pointerEvents="none">
      <text
        x={element.x + element.width / 2}
        y={element.y + element.height / 2}
        textAnchor="middle"
        className="fill-ink-soft"
        style={{
          fontSize: 19,
          fontWeight: 600,
          stroke: "#ffffff",
          strokeWidth: 5,
          paintOrder: "stroke",
          strokeLinejoin: "round",
        }}
      >
        {label}
      </text>
      {typeof areaLabel === "string" ? (
        <text
          x={element.x + element.width / 2}
          y={element.y + element.height / 2 + 22}
          textAnchor="middle"
          className="fill-ink-muted"
          style={{
            fontSize: 15,
            stroke: "#ffffff",
            strokeWidth: 4,
            paintOrder: "stroke",
            strokeLinejoin: "round",
          }}
        >
          {areaLabel}
        </text>
      ) : null}
    </g>
  );
}

function ChangeHalo({
  element,
  color,
  strong,
}: {
  element: DrawingElement;
  color: string;
  strong: boolean;
}) {
  const padding = strong ? 16 : 12;
  return (
    <rect
      x={element.x - padding}
      y={element.y - padding}
      width={element.width + padding * 2}
      height={element.height + padding * 2}
      rx={10}
      fill={color}
      opacity={strong ? 0.18 : 0.1}
      stroke={color}
      strokeWidth={strong ? 3 : 2}
      strokeDasharray={strong ? undefined : "6 4"}
      pointerEvents="none"
    />
  );
}
