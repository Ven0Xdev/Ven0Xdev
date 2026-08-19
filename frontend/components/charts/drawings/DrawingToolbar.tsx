"use client";

import { useState } from "react";
import type { DrawTool } from "./useDrawings";
import type { DrawingType } from "./types";

const SHAPE_TOOLS: { key: DrawingType; glyph: string; label: string; hint: string }[] = [
  { key: "trendline", glyph: "╱", label: "Trend line", hint: "Click two points to draw a trend line" },
  { key: "ray", glyph: "→", label: "Ray", hint: "Click two points; the line extends past the second point" },
  { key: "arrow", glyph: "↗", label: "Arrow", hint: "Click two points to draw an arrow" },
  { key: "hline", glyph: "―", label: "Horizontal line", hint: "Click once to draw a horizontal line at that price" },
  { key: "vline", glyph: "│", label: "Vertical line", hint: "Click once to draw a vertical line at that time" },
  { key: "rectangle", glyph: "▭", label: "Rectangle", hint: "Click two corners to draw a highlight zone" },
  { key: "fibonacci", glyph: "𝄒", label: "Fibonacci retracement", hint: "Click the swing low and high" },
  { key: "text", glyph: "T", label: "Text", hint: "Click once to place a text annotation" },
];

export function DrawingToolbar({
  tool,
  onSelectTool,
  magnet,
  onToggleMagnet,
  allLocked,
  onToggleLockAll,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasDrawings,
  onDeleteAll,
  onZoomIn,
  onZoomOut,
  onResetView,
  pendingFirstPoint,
}: {
  tool: DrawTool;
  onSelectTool: (t: DrawTool) => void;
  magnet: boolean;
  onToggleMagnet: () => void;
  allLocked: boolean;
  onToggleLockAll: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasDrawings: boolean;
  onDeleteAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  pendingFirstPoint: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const btnStyle = (active: boolean) => ({
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Show drawing tools"
        aria-label="Show drawing tools"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        ▸
      </button>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="flex shrink-0 flex-row flex-wrap gap-1 sm:flex-col sm:flex-nowrap"
      style={{ width: "auto" }}
    >
      <div className="flex items-center justify-between gap-1 sm:flex-col">
        <button
          type="button"
          onClick={() => onSelectTool("cursor")}
          title="Cursor / select"
          aria-label="Cursor / select"
          aria-pressed={tool === "cursor"}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
          style={btnStyle(tool === "cursor")}
        >
          ↖
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse toolbar"
          aria-label="Collapse toolbar"
          className="flex h-8 w-8 items-center justify-center rounded-md text-xs"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          ◂
        </button>
      </div>

      {SHAPE_TOOLS.map((t) => (
        <button
          key={t.key}
          type="button"
          title={t.hint}
          aria-label={t.label}
          aria-pressed={tool === t.key}
          onClick={() => onSelectTool(tool === t.key ? "cursor" : t.key)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold"
          style={btnStyle(tool === t.key)}
        >
          {t.glyph}
        </button>
      ))}

      <div className="my-1 hidden h-px w-full sm:block" style={{ background: "var(--border)" }} />

      <button
        type="button"
        onClick={onToggleMagnet}
        title="Magnet mode — snap to real candle OHLC values"
        aria-label="Magnet mode"
        aria-pressed={magnet}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
        style={btnStyle(magnet)}
      >
        🧲
      </button>
      <button
        type="button"
        onClick={onToggleLockAll}
        title={allLocked ? "Unlock all drawings" : "Lock all drawings"}
        aria-label="Lock all drawings"
        aria-pressed={allLocked}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
        style={btnStyle(allLocked)}
      >
        {allLocked ? "🔒" : "🔓"}
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm disabled:opacity-30"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        ↺
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm disabled:opacity-30"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        ↻
      </button>

      <div className="my-1 hidden h-px w-full sm:block" style={{ background: "var(--border)" }} />

      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        ＋
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        －
      </button>
      <button
        type="button"
        onClick={onResetView}
        title="Reset view"
        aria-label="Reset view"
        className="flex h-8 w-8 items-center justify-center rounded-md text-xs"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        ⤢
      </button>

      {hasDrawings && (
        <button
          type="button"
          onClick={onDeleteAll}
          title="Delete all drawings"
          aria-label="Delete all drawings"
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
          style={{ border: "1px solid var(--border)", color: "var(--status-critical)" }}
        >
          🗑
        </button>
      )}

      {tool !== "cursor" && (
        <span
          className="mt-1 rounded px-1.5 py-1 text-center text-[10px] leading-tight sm:w-16"
          style={{ color: "var(--text-muted)" }}
        >
          {pendingFirstPoint ? "Click 2nd point…" : "Click to place…"}
        </span>
      )}
    </div>
  );
}
