"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { CandlesResponse, ChartTimeframe, IndicatorSeriesResponse, SignalPayload, StreamBar } from "@/lib/types";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const TIMEFRAMES: ChartTimeframe[] = ["1m", "5m", "15m", "1H", "1D", "1W", "1M", "1Y", "ALL"];

const OVERLAYS = [
  { key: "sma_20", label: "SMA 20" },
  { key: "sma_50", label: "SMA 50" },
  { key: "ema_9", label: "EMA 9" },
  { key: "ema_21", label: "EMA 21" },
  { key: "bollinger", label: "Bollinger Bands" },
  { key: "vwap", label: "VWAP" },
] as const;

// Only "1m" gets a live SSE connection: it's the one timeframe where a
// single incoming trade maps directly onto one bar update with no
// resampling ambiguity — the same scope the old dedicated LiveChart had,
// now folded into this one chart instead of a second, separate component
// that could show conflicting state for the same underlying data.
const LIVE_TIMEFRAME: ChartTimeframe = "1m";

type ConnState = "connecting" | "live" | "stale" | "disconnected";

const STATUS_COLORS: Record<string, string> = {
  POSSIBLE_ENTRY: "var(--status-good)",
  SETUP_FORMING: "var(--series-blue)",
  WATCH: "var(--status-warning)",
  NO_TRADE: "var(--text-muted)",
  AVOID: "var(--status-critical)",
  SIGNAL_INVALIDATED: "var(--status-critical)",
};

interface TradePlanLevel {
  label: string;
  price: number;
}

function toTime(iso: string): UTCTimestamp {
  return (Date.parse(iso) / 1000) as UTCTimestamp;
}

/** Drops null gaps (a rolling window not yet mature) rather than plotting
 * a fabricated 0 — lightweight-charts simply skips points not in the
 * array, leaving a genuine visual gap where the indicator isn't defined. */
function toLineData(timestamps: string[], values: (number | null)[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined) out.push({ time: toTime(timestamps[i]), value: v });
  }
  return out;
}

function isDarkTheme(): boolean {
  return (
    document.documentElement.dataset.theme === "dark" ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light")
  );
}

export function TradingChart({
  symbol,
  tradePlan,
  onSignal,
}: {
  symbol: string;
  tradePlan?: TradePlanLevel[];
  onSignal?: (signal: SignalPayload | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRefs = useRef<{ line?: ISeriesApi<"Line">; signal?: ISeriesApi<"Line">; hist?: ISeriesApi<"Histogram"> }>({});
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const pendingBar = useRef<StreamBar | null>(null);

  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1D");
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(["sma_20"]));
  const [candles, setCandles] = useState<CandlesResponse | null>(null);
  const [indicators, setIndicators] = useState<IndicatorSeriesResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Live-mode-only state (timeframe === LIVE_TIMEFRAME).
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<string | null>(null);
  const [signal, setSignal] = useState<SignalPayload | null>(null);

  const isLive = timeframe === LIVE_TIMEFRAME;

  // Reset live-connection state during render when entering live mode or
  // switching symbols — React's own sanctioned "adjusting state when a
  // prop changes" pattern: setState called directly in the render body,
  // guarded by comparing against a *state* value (refs can't be read
  // during render under this project's ruleset) tracking the previous
  // render's key. Not inside the SSE effect below: calling setState
  // synchronously at the top of an effect body triggers an extra
  // cascading render for no benefit over doing it here.
  const liveResetKey = isLive ? `${symbol}:${isLive}` : null;
  const [prevLiveResetKey, setPrevLiveResetKey] = useState<string | null>(null);
  if (liveResetKey !== prevLiveResetKey) {
    setPrevLiveResetKey(liveResetKey);
    if (liveResetKey !== null) {
      setConn("connecting");
      setStreamMode(null);
      setLastUpdate(null);
    }
  }

  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.candles(symbol, timeframe), api.indicators(symbol, timeframe)])
      .then(([c, i]) => {
        if (cancelled) return;
        setCandles(c);
        setIndicators(i);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, retryTick]);

  // Chart lifecycle — created once per symbol, torn down on unmount/symbol change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dark = isDarkTheme();
    const good = "#0bb981";
    const bad = dark ? "#f87171" : "#dc2626";
    const neutralLine = dark ? "#60a5fa" : "#2563eb";
    const textColor = dark ? "#a7adb5" : "#545c66";
    const gridColor = dark ? "#232427" : "#e7e9ec";

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: good, downColor: bad, wickUpColor: good, wickDownColor: bad,
      borderVisible: false, priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    }, 0);
    candleRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol", priceFormat: { type: "volume" }, color: neutralLine,
    }, 0);
    volumeRef.current = volumeSeries;
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Pane 1: RSI with 30/70 reference lines.
    const rsiSeries = chart.addSeries(LineSeries, { color: neutralLine, lineWidth: 1, priceLineVisible: false }, 1);
    rsiSeries.createPriceLine({ price: 70, color: bad, lineStyle: 3, lineWidth: 1, title: "70" });
    rsiSeries.createPriceLine({ price: 30, color: good, lineStyle: 3, lineWidth: 1, title: "30" });
    rsiRef.current = rsiSeries;

    // Pane 2: MACD line/signal + histogram.
    macdRefs.current.hist = chart.addSeries(HistogramSeries, { color: neutralLine, priceLineVisible: false }, 2);
    macdRefs.current.line = chart.addSeries(LineSeries, { color: good, lineWidth: 1, priceLineVisible: false }, 2);
    macdRefs.current.signal = chart.addSeries(LineSeries, { color: bad, lineWidth: 1, priceLineVisible: false }, 2);

    const overlaySeries = overlaySeriesRef.current;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      overlaySeries.clear();
      rsiRef.current = null;
      macdRefs.current = {};
      priceLinesRef.current = [];
    };
  }, [symbol]);

  // Push candle/volume data whenever it (re)loads. A timeframe switch that
  // lands on zero bars (e.g. "1m" on a symbol just subscribed to
  // streaming) must reset the visible range too — otherwise the old
  // timeframe's zoom/pan (e.g. a multi-year "1D"/"ALL" view) stays on
  // screen under an empty candle series, which is what made "1m" look
  // like it was showing years of data.
  useEffect(() => {
    if (!candles || !candleRef.current || !volumeRef.current) return;
    candleRef.current.setData(
      candles.bars.map((b) => ({ time: toTime(b.ts), open: b.open, high: b.high, low: b.low, close: b.close }))
    );
    volumeRef.current.setData(candles.bars.map((b) => ({ time: toTime(b.ts), value: b.volume })));
    if (candles.bars.length === 0) {
      chartRef.current?.timeScale().resetTimeScale();
    } else {
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  // Push RSI/MACD sub-pane data — explicitly cleared (not left stale) when
  // the new response has no series for a pane, e.g. an intraday timeframe
  // with too few bars for a 14-period RSI to be defined anywhere.
  useEffect(() => {
    if (!indicators) return;
    const { timestamps, series } = indicators;
    rsiRef.current?.setData(series.rsi_14 ? toLineData(timestamps, series.rsi_14) : []);
    macdRefs.current.line?.setData(series.macd_line ? toLineData(timestamps, series.macd_line) : []);
    macdRefs.current.signal?.setData(series.macd_signal ? toLineData(timestamps, series.macd_signal) : []);
    macdRefs.current.hist?.setData(
      series.macd_histogram
        ? toLineData(timestamps, series.macd_histogram).map((d) => ({ ...d, color: d.value >= 0 ? "#0bb981" : "#dc2626" }))
        : []
    );
  }, [indicators]);

  // Sync toggleable price-pane overlays (SMA/EMA/Bollinger/VWAP) — a
  // selected overlay with no data in the new response (same "too few
  // intraday bars" case) is removed rather than left showing a stale line
  // from whatever timeframe was previously selected.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !indicators) return;
    const { timestamps, series } = indicators;
    const dark = isDarkTheme();
    const palette: Record<string, string> = {
      sma_20: dark ? "#60a5fa" : "#2563eb",
      sma_50: dark ? "#c084fc" : "#9333ea",
      ema_9: "#f59e0b",
      ema_21: "#ec4899",
      bollinger: dark ? "#a7adb5" : "#8a919c",
      vwap: "#0bb981",
    };

    const wanted = new Set<string>();
    for (const overlay of activeOverlays) {
      if (overlay === "bollinger") {
        wanted.add("bb_upper");
        wanted.add("bb_middle");
        wanted.add("bb_lower");
      } else {
        wanted.add(overlay);
      }
    }

    for (const key of wanted) {
      const values = series[key];
      const existing = overlaySeriesRef.current.get(key);
      if (!values || values.length === 0) {
        if (existing) {
          chart.removeSeries(existing);
          overlaySeriesRef.current.delete(key);
        }
        continue;
      }
      let s = existing;
      if (!s) {
        const color = palette[key.startsWith("bb_") ? "bollinger" : key] ?? "#8a919c";
        s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false }, 0);
        overlaySeriesRef.current.set(key, s);
      }
      s.setData(toLineData(timestamps, values));
    }
    // Remove overlays no longer selected at all.
    for (const [key, s] of overlaySeriesRef.current) {
      if (!wanted.has(key)) {
        chart.removeSeries(s);
        overlaySeriesRef.current.delete(key);
      }
    }
  }, [indicators, activeOverlays]);

  // Price-plan levels: the live Signal Engine verdict while streaming
  // "1m" (timeframe-scoped, matches what's actually on screen), the
  // static AI trade plan otherwise. Literal colors, not CSS vars —
  // lightweight-charts renders to <canvas> and cannot resolve var(--x).
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries) return;
    for (const line of priceLinesRef.current) candleSeries.removePriceLine(line);
    priceLinesRef.current = [];

    const dark = isDarkTheme();
    const entryColor = dark ? "#60a5fa" : "#2563eb";
    const stopColor = dark ? "#f87171" : "#dc2626";
    const targetColor = "#0bb981";

    if (isLive) {
      if (!signal || signal.status === "NO_SIGNAL_YET") return;
      const lines: [string, number | null | undefined, string][] = [
        ["Entry", signal.ideal_entry, entryColor],
        ["Stop", signal.stop_loss, stopColor],
        ["TP1", signal.targets?.[0], targetColor],
        ["TP2", signal.targets?.[1], targetColor],
        ["TP3", signal.targets?.[2], targetColor],
      ];
      for (const [title, price, color] of lines) {
        if (price) {
          priceLinesRef.current.push(candleSeries.createPriceLine({ price, color, lineStyle: 2, lineWidth: 1, title }));
        }
      }
      return;
    }

    if (!candles) return;
    const colorFor = (label: string) => (label === "Entry" ? entryColor : label === "Stop" ? stopColor : targetColor);
    for (const level of tradePlan ?? []) {
      priceLinesRef.current.push(
        candleSeries.createPriceLine({ price: level.price, color: colorFor(level.label), lineStyle: 2, lineWidth: 1, title: level.label })
      );
    }
  }, [tradePlan, candles, isLive, signal]);

  // Live streaming — mounted only while timeframe === "1m". Paint throttled
  // to ~4fps (backend accuracy is preserved — only rendering is throttled).
  // EventSource cannot set an Authorization header (a browser platform
  // limitation) — the access token travels as a query param instead,
  // accepted only as a fallback when no header is present (api/deps.py
  // get_current_user). No-op when auth is off or not required.
  useEffect(() => {
    if (!isLive) return;

    let disposed = false;

    api.streamBars(symbol).then(({ bars }) => {
      if (disposed) return;
      const last = bars[bars.length - 1];
      if (last) {
        setStreamMode(last.data_mode);
        setLastUpdate(last.last_update);
      }
    }).catch(() => { /* REST backfill not warm yet — SSE will fill in */ });

    api.evaluateSignal(symbol).then((s) => { if (!disposed) setSignal(s); })
      .catch(() => api.currentSignal(symbol).then((s) => { if (!disposed) setSignal(s); }).catch(() => {}));

    const token = getAccessToken();
    const streamUrl = `${API_BASE}/stream/${symbol}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(streamUrl);
    const paint = setInterval(() => {
      const bar = pendingBar.current;
      if (bar && candleRef.current) {
        candleRef.current.update({ time: toTime(bar.start), open: bar.open, high: bar.high, low: bar.low, close: bar.close });
        volumeRef.current?.update({ time: toTime(bar.start), value: bar.volume });
        pendingBar.current = null;
      }
    }, 250);

    es.addEventListener("hello", () => setConn("live"));
    es.addEventListener("bar.updated", (e) => {
      const event = JSON.parse((e as MessageEvent).data);
      pendingBar.current = event.payload as StreamBar;
      setStreamMode(event.payload.data_mode);
      setLastUpdate(event.payload.last_update);
      setConn("live");
    });
    es.addEventListener("bar.closed", (e) => {
      const bar = JSON.parse((e as MessageEvent).data).payload as StreamBar;
      candleRef.current?.update({ time: toTime(bar.start), open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      volumeRef.current?.update({ time: toTime(bar.start), value: bar.volume });
    });
    es.addEventListener("signal.updated", (e) => {
      setSignal(JSON.parse((e as MessageEvent).data).payload as SignalPayload);
    });
    es.addEventListener("provider.stale", () => setConn("stale"));
    es.addEventListener("provider.reconnected", () => setConn("live"));
    es.onerror = () => setConn("disconnected");

    return () => {
      disposed = true;
      clearInterval(paint);
      es.close();
      pendingBar.current = null;
    };
  }, [symbol, isLive]);

  useEffect(() => {
    onSignal?.(isLive ? signal : null);
  }, [signal, isLive, onSignal]);

  const toggleOverlay = (key: string) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const connColor = conn === "live" ? "var(--status-good)" : conn === "stale" ? "var(--status-warning)" : conn === "connecting" ? "var(--text-muted)" : "var(--status-critical)";
  const statusColor = signal ? STATUS_COLORS[signal.status] ?? "var(--text-muted)" : "var(--text-muted)";

  // Never claim a real feed mode before at least one verified stream event
  // has actually arrived: streamMode starts null and only a real
  // bar.updated/streamBars response ever sets it. Falling through an
  // unhandled value to "SYNTHETIC FEED" — the original bug — silently
  // mislabeled "no data yet" as synthetic even when the connection was
  // genuinely live and simply hadn't received a first tick.
  const feedLabel =
    conn === "connecting" ? "CONNECTING…"
    : conn !== "live" ? "LAST KNOWN (not live)"
    : streamMode === "live" ? "LIVE FEED"
    : streamMode === "delayed" ? "DELAYED FEED"
    : streamMode === "synthetic" ? "SYNTHETIC FEED"
    : "CONNECTING…";
  const feedColor =
    conn === "connecting" ? "var(--text-muted)"
    : conn !== "live" ? "var(--status-warning)"
    : streamMode === "live" ? "var(--status-good)"
    : streamMode === "delayed" ? "var(--series-blue)"
    : streamMode === "synthetic" ? "var(--text-muted)"
    : "var(--text-muted)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className="rounded-md px-2.5 py-1 text-xs font-semibold"
              style={{
                background: timeframe === tf ? "var(--accent-soft)" : "transparent",
                color: timeframe === tf ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {tf}
            </button>
          ))}
        </div>
        {!isLive && candles?.data_mode && (
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide"
            style={{
              color: candles.data_mode === "synthetic" ? "var(--status-warning)" : "var(--status-good)",
              background: "color-mix(in srgb, currentColor 12%, transparent)",
            }}
          >
            {candles.data_source} · {candles.data_mode}
            {candles.market_status && ` · ${candles.market_status.replace("-", " ")}`}
          </span>
        )}
      </div>

      {isLive && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: connColor }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: connColor }} />
            {conn.toUpperCase()}
          </span>
          <span
            className="rounded-md px-2 py-0.5 font-semibold tracking-wide"
            style={{ color: feedColor, background: "color-mix(in srgb, currentColor 12%, transparent)" }}
          >
            {feedLabel}
          </span>
          {candles?.market_status && (
            <span style={{ color: "var(--text-muted)" }}>market {candles.market_status.replace("-", " ")}</span>
          )}
          {signal && signal.status !== "NO_SIGNAL_YET" && (
            <span
              className="rounded-md px-2 py-0.5 font-semibold tracking-wide"
              style={{ color: statusColor, background: "color-mix(in srgb, currentColor 12%, transparent)" }}
              title={[
                `Signal ${signal.status} · ${new Date(signal.created_at).toLocaleString()}`,
                `confidence ${signal.confidence.toFixed(0)} · model ${signal.model_version} · ${signal.data_source} (${signal.data_mode})`,
                ...(signal.rejection_reasons.length ? ["Rejections:", ...signal.rejection_reasons.map((r) => `· ${r}`)] : []),
                ...(signal.bullish_reasons.length ? ["For:", ...signal.bullish_reasons.slice(0, 3).map((r) => `· ${r}`)] : []),
              ].join("\n")}
            >
              {signal.status.replace(/_/g, " ")}
            </span>
          )}
          <span style={{ color: "var(--text-muted)" }}>
            {lastUpdate ? `last update ${new Date(lastUpdate).toLocaleTimeString()}` : "waiting for first tick…"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {OVERLAYS.map((o) => (
          <label key={o.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={activeOverlays.has(o.key)} onChange={() => toggleOverlay(o.key)} />
            {o.label}
          </label>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : !candles ? (
        <Skeleton className="h-[420px] w-full" />
      ) : candles.note ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {candles.note}
        </p>
      ) : null}
      {isLive && signal && signal.rejection_reasons.length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No entry levels shown — Signal Engine rejections: {signal.rejection_reasons.join("; ")}
        </p>
      )}

      <div ref={containerRef} className="content-reveal w-full" style={{ height: 420 }} />
    </div>
  );
}
