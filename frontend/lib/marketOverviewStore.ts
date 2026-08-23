"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { MarketOverviewStock } from "./types";

const REFRESH_MS = 20_000;

/** Module-level singleton: TickerTape (mounted app-wide in AppShell) and
 * MarketOverview (the dashboard's own grid) both need this same real
 * `/dashboard/market-overview` response. Each is a genuinely slow call
 * (a synthetic-fallback pass over every active asset) — polling it twice
 * in parallel on every dashboard load doubles backend load for no reason
 * and was tripping the client's own request timeout under that doubled
 * load. One shared fetch + poll, fanned out to every subscriber, matches
 * the platform's standing "never re-run the same analysis twice" rule. */
let cachedStocks: MarketOverviewStock[] | null = null;
let cachedError: unknown = null;
let inFlight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

function fetchOnce(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = api
    .marketOverview()
    .then((r) => {
      cachedStocks = r.stocks;
      cachedError = null;
    })
    .catch((e) => {
      // A background refresh failure keeps showing the last known-good
      // real data (matches TickerTape/MarketOverview's prior behavior) —
      // only surface the error when there is no prior data at all.
      if (cachedStocks === null) cachedError = e;
    })
    .finally(() => {
      inFlight = null;
      notify();
    });
  return inFlight;
}

function ensurePolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    fetchOnce();
  }, REFRESH_MS);
}

export function useMarketOverview(): { stocks: MarketOverviewStock[] | null; error: unknown; refresh: () => Promise<void> } {
  const [, forceRerender] = useState(0);

  useEffect(() => {
    const listener = () => forceRerender((n) => n + 1);
    subscribers.add(listener);
    if (cachedStocks === null && cachedError === null) fetchOnce();
    ensurePolling();
    return () => {
      subscribers.delete(listener);
      // Stop polling once nothing is listening anymore (e.g. navigated
      // away from every page that renders TickerTape — shouldn't normally
      // happen since it's app-wide, but this keeps the store honest).
      if (subscribers.size === 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, []);

  return { stocks: cachedStocks, error: cachedError, refresh: fetchOnce };
}
