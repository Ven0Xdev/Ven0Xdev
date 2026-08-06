"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, classifyApiError } from "@/lib/api";
import type { MarketOverviewStock } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  open: "MARKET OPEN",
  closed: "MARKET CLOSED",
  "pre-market": "PRE-MARKET",
  "after-hours": "AFTER HOURS",
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - lo) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StockTile({ stock }: { stock: MarketOverviewStock }) {
  if (stock.status !== "ok" || stock.current_price === undefined) {
    return (
      <div className="card flex flex-col gap-1 p-4" style={{ borderColor: "var(--status-warning-soft)" }}>
        <span className="font-semibold">{stock.symbol}</span>
        <span className="text-xs" style={{ color: "var(--status-warning)" }}>
          {stock.note ?? "Data unavailable"}
        </span>
      </div>
    );
  }

  const up = (stock.change ?? 0) >= 0;
  const changeColor = up ? "var(--status-good)" : "var(--status-critical)";

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="card flex flex-col gap-2 p-4 transition-colors"
      style={{ transition: "background-color var(--duration-fast) var(--ease-out)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{stock.symbol}</div>
          <div className="truncate text-xs" style={{ color: "var(--text-muted)", maxWidth: 120 }}>
            {stock.company_name}
          </div>
        </div>
        {stock.chart_history && stock.chart_history.length > 1 && (
          <Sparkline values={stock.chart_history} color={changeColor} />
        )}
      </div>
      <div className="flex items-end justify-between">
        <div className="tabular text-lg font-semibold">${stock.current_price.toFixed(2)}</div>
        <div className="tabular text-xs font-medium" style={{ color: changeColor }}>
          {up ? "+" : ""}
          {stock.change?.toFixed(2)} ({up ? "+" : ""}
          {stock.change_percent?.toFixed(2)}%)
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        {stock.market_status && (
          <span style={{ color: "var(--text-muted)" }}>{STATUS_LABEL[stock.market_status] ?? stock.market_status}</span>
        )}
        {stock.data_mode === "synthetic" && (
          <span className="rounded px-1.5 py-0.5" style={{ color: "var(--status-warning)", background: "var(--status-warning-soft)" }}>
            DEMO
          </span>
        )}
      </div>
    </Link>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="card flex flex-col gap-2 p-4">
          <div className="h-4 w-14 animate-pulse rounded" style={{ background: "var(--surface-2)" }} />
          <div className="h-6 w-20 animate-pulse rounded" style={{ background: "var(--surface-2)" }} />
        </div>
      ))}
    </div>
  );
}

export function MarketOverview() {
  const [stocks, setStocks] = useState<MarketOverviewStock[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  // Kept free of synchronous setState so it's safe to hand directly to
  // useEffect — every update happens inside a .then()/.catch() callback.
  const load = useCallback(() => {
    api
      .marketOverview()
      .then((r) => setStocks(r.stocks))
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);

  // Belt-and-suspenders: even though lib/api.ts now enforces a request
  // timeout (so `error` should always eventually be set), never let this
  // section show a bare skeleton forever — surface a retry affordance if
  // nothing has resolved after a few seconds.
  useEffect(() => {
    if (stocks !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [stocks, error]);

  // Event-handler-only: safe to setState synchronously here.
  const retry = useCallback(() => {
    setError(null);
    setStocks(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  if (error) {
    const { title, hint } = classifyApiError(error);
    return (
      <div className="card flex flex-col gap-2 p-5 text-sm" style={{ borderColor: "var(--status-critical-soft)" }}>
        <p className="font-semibold" style={{ color: "var(--status-critical)" }}>
          {title}
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{hint}</p>
        <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
          Retry
        </button>
      </div>
    );
  }

  if (stocks === null) {
    if (loadingTooLong) {
      return (
        <div className="card flex flex-col gap-2 p-5 text-sm">
          <p style={{ color: "var(--text-muted)" }}>Still waiting on the backend for market data.</p>
          <button onClick={retry} className="btn btn-secondary btn-sm w-fit">
            Retry
          </button>
        </div>
      );
    }
    return <OverviewSkeleton />;
  }

  if (stocks.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-muted)" }}>No market overview data available.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stocks.map((s) => (
        <StockTile key={s.symbol} stock={s} />
      ))}
    </div>
  );
}
