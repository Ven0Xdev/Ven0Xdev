"use client";

import { useCountUp, useFlashOnChange } from "@/lib/motion";

/** Tabular, count-up number display that briefly pulses green/red exactly
 * when its own previous real value changed (see lib/motion.ts's
 * useFlashOnChange — never a synthetic delta). Drop-in replacement for a
 * bare `{value.toFixed(n)}` wherever a metric can legitimately update
 * (price, score, stat tile) without changing what value is shown. */
export function AnimatedNumber({
  value,
  format = (n: number) => n.toFixed(2),
  durationMs = 500,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const display = useCountUp(value, durationMs);
  const flash = useFlashOnChange(value);

  return (
    <span
      className={`tabular ${className}`}
      data-flash={flash ?? undefined}
      style={{
        display: "inline-block",
        borderRadius: "var(--radius-sm)",
        transition: `background-color var(--duration-slow) var(--ease-out), color var(--duration-slow) var(--ease-out)`,
        background: flash === "up" ? "var(--status-good-soft)" : flash === "down" ? "var(--status-critical-soft)" : "transparent",
        color: flash === "up" ? "var(--status-good)" : flash === "down" ? "var(--status-critical)" : "inherit",
      }}
    >
      {format(display)}
    </span>
  );
}
