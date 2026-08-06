"use client";

import Link from "next/link";
import { useMarketOverview } from "@/lib/marketOverviewStore";
import { AnimatedNumber } from "./AnimatedNumber";

/** Persistent, app-wide strip of live prices — the same real data as
 * MarketOverview's grid (`GET /dashboard/market-overview`), via the same
 * shared fetch/poll (lib/marketOverviewStore.ts) rather than a second
 * independent poll of that same slow endpoint. Never renders a value that
 * didn't come back from it: a failed refresh silently keeps the last good
 * data rather than blanking or inventing a tick, and this shows nothing
 * (not a fabricated placeholder row) until the first successful load. */
export function TickerTape() {
  const { stocks: allStocks } = useMarketOverview();
  const stocks = allStocks?.filter((s) => s.status === "ok" && s.current_price !== undefined) ?? null;

  if (stocks === null) {
    return (
      <div
        className="skeleton h-9 w-full shrink-0"
        style={{ borderRadius: 0 }}
        aria-hidden="true"
      />
    );
  }
  if (stocks.length === 0) return null;

  return (
    <div
      className="ticker-tape group relative h-9 shrink-0 overflow-hidden border-b"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
      role="marquee"
      aria-label="Live market ticker"
    >
      <div className="ticker-tape-track flex h-full w-max items-center group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
        {[stocks, stocks].map((pass, passIdx) => (
          <div key={passIdx} className="flex h-full items-center" aria-hidden={passIdx === 1}>
            {pass.map((s, i) => {
              const up = (s.change_percent ?? 0) >= 0;
              const color = up ? "var(--status-good)" : "var(--status-critical)";
              return (
                <Link
                  key={`${passIdx}-${s.symbol}-${i}`}
                  href={`/stock/${s.symbol}`}
                  tabIndex={passIdx === 1 ? -1 : 0}
                  className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {s.symbol}
                  </span>
                  <AnimatedNumber value={s.current_price!} format={(n) => `$${n.toFixed(2)}`} className="tabular" />
                  <span className="tabular inline-flex items-center gap-0.5 font-semibold" style={{ color }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: up ? "none" : "rotate(180deg)" }}>
                      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {up ? "+" : ""}
                    {(s.change_percent ?? 0).toFixed(2)}%
                  </span>
                  {s.data_mode === "synthetic" && (
                    <span className="text-[9px] font-semibold tracking-wide" style={{ color: "var(--status-warning)" }}>
                      DEMO
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
