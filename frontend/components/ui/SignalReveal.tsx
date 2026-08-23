"use client";

import type { SignalPayload } from "@/lib/types";

type Bucket = "BUY" | "SELL" | "WATCH" | "NO_TRADE";

/** Maps the Signal Engine's real statuses (services/signals/engine.py's
 * status ladder) onto the simpler BUY/SELL/WATCH/NO_TRADE vocabulary for
 * display — no new backend concept, just a presentation grouping. */
const BUCKET_FOR: Partial<Record<SignalPayload["status"], Bucket>> = {
  POSSIBLE_ENTRY: "BUY",
  SETUP_FORMING: "BUY",
  AVOID: "SELL",
  SIGNAL_INVALIDATED: "SELL",
  REDUCE: "SELL",
  EXIT: "SELL",
  WATCH: "WATCH",
  NO_TRADE: "NO_TRADE",
  POSITION_ACTIVE: "NO_TRADE",
};

const BUCKET_STYLE: Record<Bucket, { label: string; color: string; icon: string }> = {
  BUY: { label: "BUY", color: "var(--status-good)", icon: "M12 19V5M5 12l7-7 7 7" },
  SELL: { label: "SELL", color: "var(--status-critical)", icon: "M12 5v14M19 12l-7 7-7-7" },
  WATCH: { label: "WATCH", color: "var(--status-warning)", icon: "M12 8v4l2.5 2.5 M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z" },
  NO_TRADE: { label: "NO TRADE", color: "var(--text-muted)", icon: "M6 6l12 12M18 6 6 18" },
};

/** Elegant, once-per-status reveal card for the Signal Engine's current
 * verdict. Keyed by `status` at the call site (see TradingChart/stock page)
 * so the entrance animation fires exactly when the real status changes —
 * never on every SSE reaffirmation of the same status. Renders nothing for
 * statuses that don't map to a real verdict yet (NO_SIGNAL_YET). */
export function SignalReveal({ signal }: { signal: SignalPayload | null }) {
  if (!signal || signal.status === "NO_SIGNAL_YET") return null;
  const bucket = BUCKET_FOR[signal.status] ?? "NO_TRADE";
  const style = BUCKET_STYLE[bucket];

  return (
    <div
      className="signal-reveal card flex items-center gap-3 p-4"
      style={{ borderColor: `color-mix(in srgb, ${style.color} 30%, var(--border))` }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${style.color} 16%, transparent)`, color: style.color }}
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d={style.icon} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold tracking-wide" style={{ color: style.color }}>
          {style.label}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {signal.status.replace(/_/g, " ")} · confidence {signal.confidence.toFixed(0)}%
          {signal.risk_reward ? ` · R:R ${signal.risk_reward.toFixed(1)}x` : ""}
        </span>
      </div>
    </div>
  );
}
