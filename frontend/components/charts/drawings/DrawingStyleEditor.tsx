"use client";

import type { Drawing, DrawingStyle } from "./types";

const COLORS = ["#2563eb", "#0bb981", "#dc2626", "#f59e0b", "#c084fc", "#ec4899", "#a7adb5"];
const DASH_OPTIONS: DrawingStyle["dash"][] = ["solid", "dashed", "dotted"];

/** Original Nexora popover for editing the selected drawing — color,
 * width, opacity, dash style, text (text tool) and Fibonacci levels
 * (fibonacci tool). Positioned by the caller (TradingChart knows where
 * the selected drawing's anchor lands in pixels); this component only
 * renders the controls themselves. */
export function DrawingStyleEditor({
  drawing,
  onChangeStyle,
  onChangeText,
  onChangeLevels,
  onToggleLock,
  onToggleHidden,
  onDelete,
  onClose,
}: {
  drawing: Drawing;
  onChangeStyle: (style: DrawingStyle) => void;
  onChangeText?: (text: string) => void;
  onChangeLevels?: (levels: number[]) => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const style = drawing.payload.style;

  return (
    <div
      className="flex w-64 flex-col gap-3 rounded-lg p-3 text-xs shadow-lg"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      role="dialog"
      aria-label="Drawing style"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold capitalize" style={{ color: "var(--text-secondary)" }}>
          {drawing.payload.type} style
        </span>
        <button type="button" onClick={onClose} aria-label="Close style editor" style={{ color: "var(--text-muted)" }}>
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Color">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Color ${c}`}
            aria-pressed={style.color === c}
            onClick={() => onChangeStyle({ ...style, color: c })}
            className="h-5 w-5 rounded-full"
            style={{ background: c, outline: style.color === c ? "2px solid var(--text-primary)" : "none", outlineOffset: 1 }}
          />
        ))}
      </div>

      <label className="flex items-center justify-between gap-2">
        <span style={{ color: "var(--text-muted)" }}>Width</span>
        <input
          type="range" min={1} max={6} step={1} value={style.width}
          onChange={(e) => onChangeStyle({ ...style, width: Number(e.target.value) })}
          className="w-32"
        />
      </label>

      <label className="flex items-center justify-between gap-2">
        <span style={{ color: "var(--text-muted)" }}>Opacity</span>
        <input
          type="range" min={0.1} max={1} step={0.1} value={style.opacity}
          onChange={(e) => onChangeStyle({ ...style, opacity: Number(e.target.value) })}
          className="w-32"
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <span style={{ color: "var(--text-muted)" }}>Dash</span>
        <div className="flex gap-1">
          {DASH_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={style.dash === d}
              onClick={() => onChangeStyle({ ...style, dash: d })}
              className="rounded px-2 py-0.5 capitalize"
              style={{
                background: style.dash === d ? "var(--accent-soft)" : "transparent",
                color: style.dash === d ? "var(--accent)" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {drawing.payload.type === "text" && (
        <label className="flex flex-col gap-1">
          <span style={{ color: "var(--text-muted)" }}>Text</span>
          <input
            type="text"
            value={drawing.payload.text}
            onChange={(e) => onChangeText?.(e.target.value)}
            className="rounded px-2 py-1"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
        </label>
      )}

      {drawing.payload.type === "text" && (
        <label className="flex items-center justify-between gap-2">
          <span style={{ color: "var(--text-muted)" }}>Text size</span>
          <input
            type="range" min={10} max={24} step={1} value={style.fontSize ?? 13}
            onChange={(e) => onChangeStyle({ ...style, fontSize: Number(e.target.value) })}
            className="w-32"
          />
        </label>
      )}

      {drawing.payload.type === "fibonacci" && (
        <div className="flex flex-col gap-1">
          <span style={{ color: "var(--text-muted)" }}>Levels</span>
          <div className="flex flex-wrap gap-1">
            {drawing.payload.levels.map((lv, i) => (
              <input
                key={i}
                type="number" step={0.001} value={lv}
                onChange={(e) => {
                  const next = [...drawing.payload.type === "fibonacci" ? drawing.payload.levels : []];
                  next[i] = Number(e.target.value);
                  onChangeLevels?.(next);
                }}
                className="w-14 rounded px-1 py-0.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        <button type="button" onClick={onToggleLock} className="rounded px-2 py-1" style={{ border: "1px solid var(--border)" }}>
          {drawing.locked ? "🔒 Unlock" : "🔓 Lock"}
        </button>
        <button type="button" onClick={onToggleHidden} className="rounded px-2 py-1" style={{ border: "1px solid var(--border)" }}>
          {drawing.hidden ? "👁 Show" : "🙈 Hide"}
        </button>
        <button
          type="button" onClick={onDelete} className="ml-auto rounded px-2 py-1"
          style={{ border: "1px solid var(--border)", color: "var(--status-critical)" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
