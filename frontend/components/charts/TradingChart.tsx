"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "@/lib/api";
import type { CandlesResponse, ChartTimeframe, IndicatorSeriesResponse } from "@/lib/types";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

const TIMEFRAMES: ChartTimeframe[] = ["1m", "5m", "15m", "1H", "1D", "1W", "1M", "1Y", "ALL"];

const OVERLAYS = [
  { key: "sma_20", label: "SMA 20" },
  { key: "sma_50", label: "SMA 50" },
  { key: "ema_9", label: "EMA 9" },
  { key: "ema_21", label: "EMA 21" },
  { key: "bollinger", label: "Bollinger Bands" },
  { key: "vwap", label: "VWAP" },
] as const;

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

export function TradingChart({ symbol, tradePlan }: { symbol: string; tradePlan?: TradePlanLevel[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRefs = useRef<{ line?: ISeriesApi<"Line">; signal?: ISeriesApi<"Line">; hist?: ISeriesApi<"Histogram"> }>({});

  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1D");
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(["sma_20"]));
  const [candles, setCandles] = useState<CandlesResponse | null>(null);
  const [indicators, setIndicators] = useState<IndicatorSeriesResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

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

    const dark = document.documentElement.dataset.theme === "dark" ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light");
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
    };
  }, [symbol]);

  // Push candle/volume data whenever it (re)loads.
  useEffect(() => {
    if (!candles || !candleRef.current || !volumeRef.current) return;
    candleRef.current.setData(
      candles.bars.map((b) => ({ time: toTime(b.ts), open: b.open, high: b.high, low: b.low, close: b.close }))
    );
    volumeRef.current.setData(candles.bars.map((b) => ({ time: toTime(b.ts), value: b.volume })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Push RSI/MACD sub-pane data.
  useEffect(() => {
    if (!indicators) return;
    const { timestamps, series } = indicators;
    if (rsiRef.current && series.rsi_14) rsiRef.current.setData(toLineData(timestamps, series.rsi_14));
    if (macdRefs.current.line && series.macd_line) macdRefs.current.line.setData(toLineData(timestamps, series.macd_line));
    if (macdRefs.current.signal && series.macd_signal) macdRefs.current.signal.setData(toLineData(timestamps, series.macd_signal));
    if (macdRefs.current.hist && series.macd_histogram) {
      macdRefs.current.hist.setData(
        toLineData(timestamps, series.macd_histogram).map((d) => ({ ...d, color: d.value >= 0 ? "#0bb981" : "#dc2626" }))
      );
    }
  }, [indicators]);

  // Sync toggleable price-pane overlays (SMA/EMA/Bollinger/VWAP).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !indicators) return;
    const { timestamps, series } = indicators;
    const dark = document.documentElement.dataset.theme === "dark" ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light");
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

    // Remove overlays no longer selected.
    for (const [key, s] of overlaySeriesRef.current) {
      if (!wanted.has(key)) {
        chart.removeSeries(s);
        overlaySeriesRef.current.delete(key);
      }
    }
    // Add/update selected overlays.
    for (const key of wanted) {
      const values = series[key];
      if (!values) continue;
      let s = overlaySeriesRef.current.get(key);
      if (!s) {
        const color = palette[key.startsWith("bb_") ? "bollinger" : key] ?? "#8a919c";
        s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false }, 0);
        overlaySeriesRef.current.set(key, s);
      }
      s.setData(toLineData(timestamps, values));
    }
  }, [indicators, activeOverlays]);

  // AI trade-plan levels (entry/stop/targets) as price lines on the candle
  // series — literal colors, not CSS vars: lightweight-charts renders to
  // <canvas> and cannot resolve var(--x) the way DOM elements do (same
  // constraint LiveChart.tsx documents for its own price lines).
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries || !candles) return;
    const dark = document.documentElement.dataset.theme === "dark" ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light");
    const entryColor = dark ? "#60a5fa" : "#2563eb";
    const stopColor = dark ? "#f87171" : "#dc2626";
    const targetColor = "#0bb981";
    const colorFor = (label: string) => (label === "Entry" ? entryColor : label === "Stop" ? stopColor : targetColor);

    const lines = (tradePlan ?? []).map((level) =>
      candleSeries.createPriceLine({ price: level.price, color: colorFor(level.label), lineStyle: 2, lineWidth: 1, title: level.label })
    );
    return () => {
      for (const line of lines) candleSeries.removePriceLine(line);
    };
  }, [tradePlan, candles]);

  const toggleOverlay = (key: string) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
        {candles?.data_mode && (
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide"
            style={{
              color: candles.data_mode === "synthetic" ? "var(--status-warning)" : "var(--status-good)",
              background: "color-mix(in srgb, currentColor 12%, transparent)",
            }}
          >
            {candles.data_source} · {candles.data_mode}
          </span>
        )}
      </div>

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

      <div ref={containerRef} className="content-reveal w-full" style={{ height: 420 }} />
    </div>
  );
}
