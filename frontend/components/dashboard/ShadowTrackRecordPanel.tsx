"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ShadowStats } from "@/lib/types";

/** Shadow observation track record — a passive, hypothetical readout of
 * what this symbol's fired NCS signals *would* have returned, using real
 * closed-bar prices only. This is explicitly NOT the paper trading
 * engine and is never labeled "NEXORA INTERNAL PAPER" — nothing here
 * places, opens, or touches any account/balance/position a user
 * actually owns. It exists to build an honest signal-quality track
 * record, visible before any autonomous execution is ever allowed to
 * act on NCS at all. */
export function ShadowTrackRecordPanel({ symbol }: { symbol: string }) {
  const [stats, setStats] = useState<ShadowStats | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.shadowStats(symbol).then(setStats).catch(setError);
  }, [symbol]);

  return (
    <div className="card animate-in p-5 sm:p-6">
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Shadow Signal Track Record
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        What following {symbol}&apos;s NCS signals would have returned — a hypothetical, passive readout, never an
        executed trade of any kind (see Paper Trading for the platform&apos;s one real execution simulator).
      </p>

      {error !== null && (
        <p className="mt-3 text-xs" style={{ color: "var(--status-critical)" }}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {!stats ? null : stats.count_closed === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          No closed shadow signals yet for {symbol}
          {stats.count_open > 0 ? ` (${stats.count_open} open, still being tracked)` : ""}.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Win rate" value={`${stats.win_rate_pct?.toFixed(0)}%`} />
          <Stat
            label="Avg return"
            value={`${((stats.avg_pnl_pct ?? 0) * 100).toFixed(2)}%`}
            accent={(stats.avg_pnl_pct ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)"}
          />
          <Stat label="Closed signals" value={String(stats.count_closed)} />
          <Stat label="Open (tracking)" value={String(stats.count_open)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="tabular mt-0.5 text-lg font-semibold" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
