"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useTimezone } from "@/components/providers/TimezoneProvider";
import { formatInTimeZone, formatInTimeZoneWithAbbr } from "@/lib/timezone";
import type {
  CandlesResponse,
  ChartRange,
  ChartTimeframe,
  IndicatorSeriesResponse,
  NcsSignal,
  NewsPipelineArticle,
  SignalPayload,
  StreamBar,
} from "@/lib/types";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { DrawingToolbar, type DrawTool } from "@/components/charts/DrawingToolbar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// Interval (bar granularity) and Range (how far back the chart looks) are
// independent controls — see backend bars_for_timeframe's docstring
// (services/signals/engine.py) for the authoritative mapping this mirrors.
// "1Y"/"ALL" used to be Interval buttons here; they're Range values now.
const INTERVALS: ChartTimeframe[] = ["1m", "5m", "15m", "1H", "1D", "1W", "1M"];
const INTRADAY_RANGES: ChartRange[] = ["1D", "5D", "1M"];
const DAILY_RANGES: ChartRange[] = ["1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];
const DEFAULT_INTRADAY_RANGE: ChartRange = "1D";
const DEFAULT_DAILY_RANGE: ChartRange = "1Y";

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

type MarkerTooltipInfo =
  | { kind: "news"; article: NewsPipelineArticle }
  | { kind: "ncs"; signal: NcsSignal; vetoed: boolean };

const NCS_BUY_FAMILY = new Set(["STRONG_BUY", "BUY"]);
const NCS_SELL_FAMILY = new Set(["STRONG_SELL", "SELL"]);

function ncsBucket(verdict: string | null): "BUY" | "SELL" | "NEUTRAL" | null {
  if (verdict === null) return null;
  if (NCS_BUY_FAMILY.has(verdict)) return "BUY";
  if (NCS_SELL_FAMILY.has(verdict)) return "SELL";
  return "NEUTRAL";
}

/** lightweight-charts' own tick-mark formatter, re-derived per selected
 * timezone so the x-axis (and everything else on the chart) represents the
 * same instant as the REST-backfilled and SSE-streamed bars — both of
 * which are pushed as `UTCTimestamp` seconds via `toTime()` above, so a
 * historical bar and a live tick for the same moment land on the exact
 * same tick mark regardless of which feed produced them. */
function makeTickMarkFormatter(timeZone: string) {
  return (time: Time, tickMarkType: TickMarkType): string => {
    const date = new Date((time as UTCTimestamp) * 1000);
    switch (tickMarkType) {
      case TickMarkType.Year:
        return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date);
      case TickMarkType.Month:
        return new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(date);
      case TickMarkType.DayOfMonth:
        return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
      case TickMarkType.TimeWithSeconds:
        return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
      case TickMarkType.Time:
      default:
        return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    }
  };
}

/** Crosshair/tooltip time label — same source-of-truth conversion as the
 * tick marks, with the zone abbreviation appended per the "abbreviation
 * beside chart timestamps" requirement. */
function makeTimeFormatter(timeZone: string) {
  return (time: Time): string => {
    const date = new Date((time as UTCTimestamp) * 1000);
    return formatInTimeZoneWithAbbr(date.toISOString(), timeZone, { style: "datetime", seconds: true });
  };
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

function isIntradayRangeInterval(tf: ChartTimeframe): boolean {
  return tf === "5m" || tf === "15m" || tf === "1H";
}

/** null for the live "1m" interval — Range doesn't apply while streaming. */
function defaultRangeForInterval(tf: ChartTimeframe): ChartRange | null {
  if (tf === "1m") return null;
  return isIntradayRangeInterval(tf) ? DEFAULT_INTRADAY_RANGE : DEFAULT_DAILY_RANGE;
}

type Drawing =
  | { id: string; type: "trendline"; p1: { time: UTCTimestamp; price: number }; p2: { time: UTCTimestamp; price: number } }
  | { id: string; type: "hline"; price: number };

function drawingsStorageKey(symbol: string): string {
  return `nexora:chart-drawings:${symbol}`;
}

function loadDrawings(symbol: string): Drawing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(drawingsStorageKey(symbol));
    return raw ? (JSON.parse(raw) as Drawing[]) : [];
  } catch {
    return [];
  }
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
  const { effectiveTimeZone, abbreviation, ready: tzReady } = useTimezone();

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRefs = useRef<{ line?: ISeriesApi<"Line">; signal?: ISeriesApi<"Line">; hist?: ISeriesApi<"Histogram"> }>({});
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const pendingBar = useRef<StreamBar | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const trendlineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const hlinePriceLinesRef = useRef<Map<string, IPriceLine>>(new Map());

  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1D");
  const [range, setRange] = useState<ChartRange | null>(defaultRangeForInterval("1D"));
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(["sma_20"]));
  const [candles, setCandles] = useState<CandlesResponse | null>(null);
  const [indicators, setIndicators] = useState<IndicatorSeriesResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  // NCS + news chart markers — annotations only, see the module docstring.
  const [ncsHistory, setNcsHistory] = useState<NcsSignal[]>([]);
  const [newsForMarkers, setNewsForMarkers] = useState<NewsPipelineArticle[]>([]);
  // lightweight-charts' markers plugin has no built-in hover tooltip — this
  // is that tooltip, keyed by the same UTCTimestamp every marker is placed
  // at, so a crosshair-move hit test can look up what's actually under it.
  const markerTooltipsRef = useRef<Map<number, MarkerTooltipInfo>>(new Map());
  const [hoveredMarker, setHoveredMarker] = useState<{ x: number; y: number; info: MarkerTooltipInfo } | null>(null);

  // Drawing toolbar — trendline/horizontal-line, persisted per symbol in
  // localStorage (client-side only: not shared across devices/sessions,
  // which is an honest, explicitly scoped limitation, not a hidden one).
  const [drawTool, setDrawTool] = useState<DrawTool>("none");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [pendingPoint, setPendingPoint] = useState<{ time: UTCTimestamp; price: number } | null>(null);

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

  // Reset Range to that interval-class's default whenever Interval changes
  // — same render-body pattern as the live-reset block above. Also resets
  // whenever the symbol changes together with the interval (both land in
  // one render), which is fine: `range` is re-derived identically either way.
  const [prevIntervalForRange, setPrevIntervalForRange] = useState<ChartTimeframe>(timeframe);
  if (timeframe !== prevIntervalForRange) {
    setPrevIntervalForRange(timeframe);
    setRange(defaultRangeForInterval(timeframe));
  }

  // Load this symbol's saved drawings (if any) whenever the symbol changes.
  const [prevSymbolForDrawings, setPrevSymbolForDrawings] = useState<string | null>(null);
  if (symbol !== prevSymbolForDrawings) {
    setPrevSymbolForDrawings(symbol);
    setDrawings(loadDrawings(symbol));
    setDrawTool("none");
    setPendingPoint(null);
  }

  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.candles(symbol, timeframe, range), api.indicators(symbol, timeframe, range)])
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
  }, [symbol, timeframe, range, retryTick]);

  // NCS + news markers — fetched independently of the candle/indicator
  // load above (different endpoints, no reason to block on either), keyed
  // on [symbol, timeframe] only: NCS history and news don't have a Range
  // dimension, they're just plotted wherever they land within whatever
  // candles are currently visible.
  //
  // Re-polled every 60s while mounted: `app/workers/ncs_scheduler.py`
  // evaluates and persists new NCS rows in the background on its own
  // interval, independently of whether this chart is even open — without
  // this poll, a fresh Buy/Sell marker would only ever appear after a full
  // page reload.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.ncsHistory(symbol, timeframe).then((r) => !cancelled && setNcsHistory(r.signals)).catch(() => !cancelled && setNcsHistory([]));
      api.newsForSymbol(symbol).then((r) => !cancelled && setNewsForMarkers(r.articles)).catch(() => !cancelled && setNewsForMarkers([]));
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe]);

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
      // Timezone-aware tick/tooltip formatters are applied by the effect
      // just below, not here — it re-runs on every mount too (all effects
      // run once after the initial render regardless of deps), so this
      // avoids depending on `effectiveTimeZone` in an effect that must
      // only ever run on [symbol] (re-running it on every timezone change
      // would tear down and recreate the whole chart for a display-only
      // change).
      timeScale: { timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: good, downColor: bad, wickUpColor: good, wickDownColor: bad,
      borderVisible: false, priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    }, 0);
    candleRef.current = candleSeries;
    markersPluginRef.current = createSeriesMarkers(candleSeries, []);

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
    const trendlineSeries = trendlineSeriesRef.current;
    const hlinePriceLines = hlinePriceLinesRef.current;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      overlaySeries.clear();
      rsiRef.current = null;
      macdRefs.current = {};
      priceLinesRef.current = [];
      markersPluginRef.current = null;
      trendlineSeries.clear();
      hlinePriceLines.clear();
    };
  }, [symbol]);

  // Re-derive the chart's axis/tooltip formatters whenever the resolved
  // display timezone changes (device zone detected after mount, or the
  // user switches modes in Settings) — updates the existing chart in
  // place rather than tearing it down, since the underlying data/zoom
  // state shouldn't reset just because the *display* zone changed.
  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { tickMarkFormatter: makeTickMarkFormatter(effectiveTimeZone) },
      localization: { timeFormatter: makeTimeFormatter(effectiveTimeZone) },
    });
  }, [effectiveTimeZone]);

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

  // NCS + news markers on the candle series — chart annotations only, see
  // the module docstring: nothing here places, opens, or even proposes a
  // paper order.
  //
  // NCS markers are keyed off `fired`, never every confirmed row — see
  // NcsSignal's own docstring ("the one field a chart/UI should key 'new
  // marker' off of, never every row, which would repeat markers on every
  // unchanged re-evaluation"). A row can only ever fire on a BUY/SELL-family
  // bucket (services/signals/ncs.py's evaluate_ncs never sets fired=True on
  // NEUTRAL or on a vetoed row), so this filter alone also fixes what was
  // previously a real bug here: confirmed NEUTRAL rows fell into the
  // `else` (bearish) branch and rendered as a false red "Sell" arrow.
  //
  // Vetoed BUY/SELL-family confirmations never fire (by the same backend
  // rule) and were previously dropped from the chart entirely — silently
  // hiding a Red-Team veto from the one place a user is actually looking.
  // They now get their own distinct marker (gray circle, veto reason in
  // the hover tooltip), deduped the same way `fired` dedupes real
  // signals: only the first bar of a consecutive same-bucket vetoed streak
  // gets a marker, never one per bar.
  //
  // News markers use a square shape (NCS uses arrows) specifically so
  // they can never be visually mistaken for an NCS Neutral marker — NCS
  // never draws a marker for Neutral at all (it stays in the NCS panel
  // only, per design), so a gray shape on the chart is always news.
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin) return;
    const tooltips = new Map<number, MarkerTooltipInfo>();

    const ncsMarkers: SeriesMarker<Time>[] = ncsHistory
      .filter((s) => s.fired)
      .map((s) => {
        const verdict = s.confirmed_verdict as string;
        const bullish = verdict === "STRONG_BUY" || verdict === "BUY";
        const strong = verdict === "STRONG_BUY" || verdict === "STRONG_SELL";
        const time = toTime(s.bar_ts);
        tooltips.set(time as number, { kind: "ncs", signal: s, vetoed: false });
        return {
          time,
          position: bullish ? "belowBar" : "aboveBar",
          shape: bullish ? "arrowUp" : "arrowDown",
          color: bullish ? "#0bb981" : "#dc2626",
          text: strong ? (bullish ? "Strong Buy" : "Strong Sell") : bullish ? "Buy" : "Sell",
          size: strong ? 1.6 : 1.1,
        } satisfies SeriesMarker<Time>;
      });

    const vetoedSorted = [...ncsHistory]
      .filter((s) => s.vetoed && ncsBucket(s.confirmed_verdict) !== "NEUTRAL" && ncsBucket(s.confirmed_verdict) !== null)
      .sort((a, b) => toTime(a.bar_ts) - toTime(b.bar_ts));
    let lastVetoedBucket: string | null = null;
    const vetoedMarkers: SeriesMarker<Time>[] = [];
    for (const s of vetoedSorted) {
      const bucket = ncsBucket(s.confirmed_verdict);
      if (bucket === lastVetoedBucket) continue; // same unbroken streak — already marked
      lastVetoedBucket = bucket;
      const time = toTime(s.bar_ts);
      tooltips.set(time as number, { kind: "ncs", signal: s, vetoed: true });
      vetoedMarkers.push({
        time,
        position: bucket === "BUY" ? "belowBar" : "aboveBar",
        shape: "circle",
        color: "#8a919c",
        text: "VETOED",
        size: 1,
      });
    }

    const newsMarkers: SeriesMarker<Time>[] = newsForMarkers.map((a) => {
      const time = toTime(a.published_at);
      tooltips.set(time as number, { kind: "news", article: a });
      return {
        time,
        position: "aboveBar",
        shape: "square",
        color: a.sentiment_label === "positive" ? "#0bb981" : a.sentiment_label === "negative" ? "#dc2626" : "#8a919c",
        text: "News",
        size: 0.6,
      } satisfies SeriesMarker<Time>;
    });

    markerTooltipsRef.current = tooltips;
    const combined = [...ncsMarkers, ...vetoedMarkers, ...newsMarkers].sort(
      (a, b) => (a.time as number) - (b.time as number)
    );
    plugin.setMarkers(combined);
  }, [ncsHistory, newsForMarkers, candles]);

  // Marker hover tooltip — lightweight-charts' SeriesMarkers plugin has no
  // built-in one, so this hit-tests the crosshair's bar time against the
  // lookup built above and positions a floating tooltip at the cursor.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined) {
        setHoveredMarker(null);
        return;
      }
      const info = markerTooltipsRef.current.get(param.time as number);
      if (!info) {
        setHoveredMarker(null);
        return;
      }
      setHoveredMarker({ x: param.point.x, y: param.point.y, info });
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [symbol]);

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

  // Render drawn trendlines/horizontal lines. Diffs against the previous
  // render (removes series/price-lines whose id disappeared, adds new
  // ones) rather than clearing everything every time — a trendline is
  // just a 2-point LineSeries connecting its two clicked points.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    if (!chart || !candleSeries) return;

    const wantedIds = new Set(drawings.map((d) => d.id));
    for (const [id, s] of trendlineSeriesRef.current) {
      if (!wantedIds.has(id)) {
        chart.removeSeries(s);
        trendlineSeriesRef.current.delete(id);
      }
    }
    for (const [id, line] of hlinePriceLinesRef.current) {
      if (!wantedIds.has(id)) {
        candleSeries.removePriceLine(line);
        hlinePriceLinesRef.current.delete(id);
      }
    }

    for (const d of drawings) {
      if (d.type === "trendline") {
        if (trendlineSeriesRef.current.has(d.id)) continue;
        const s = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 0);
        s.setData([
          { time: d.p1.time, value: d.p1.price },
          { time: d.p2.time, value: d.p2.price },
        ]);
        trendlineSeriesRef.current.set(d.id, s);
      } else {
        if (hlinePriceLinesRef.current.has(d.id)) continue;
        const line = candleSeries.createPriceLine({
          price: d.price, color: "#f59e0b", lineStyle: 0, lineWidth: 2, title: "drawn",
        });
        hlinePriceLinesRef.current.set(d.id, line);
      }
    }
  }, [drawings]);

  // Persist this symbol's drawings — client-side only (see the state
  // declaration above for why that's an intentional, honest scope).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(drawingsStorageKey(symbol), JSON.stringify(drawings));
  }, [symbol, drawings]);

  // Drawing-tool click handling: trendline needs two clicks (first click
  // stores a pending point, second click completes the drawing and clears
  // the pending point + tool); horizontal line completes on one click.
  // Disabled while `drawTool === "none"` so ordinary chart interaction
  // (panning, the crosshair) is completely unaffected when no tool is active.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    if (!chart || !candleSeries || drawTool === "none") return;

    const handler = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price === null) return;
      const time = param.time as UTCTimestamp;

      if (drawTool === "hline") {
        setDrawings((prev) => [...prev, { id: `hline-${Date.now()}`, type: "hline", price }]);
        setDrawTool("none");
        return;
      }

      // trendline
      setPendingPoint((prev) => {
        if (prev === null) return { time, price };
        setDrawings((d) => [...d, { id: `trendline-${Date.now()}`, type: "trendline", p1: prev, p2: { time, price } }]);
        setDrawTool("none");
        return null;
      });
    };

    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [drawTool]);

  const handleSelectDrawTool = useCallback((tool: DrawTool) => {
    setDrawTool(tool);
    setPendingPoint(null);
  }, []);

  const handleClearDrawings = useCallback(() => {
    setDrawings([]);
    setDrawTool("none");
    setPendingPoint(null);
  }, []);

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Chart interval">
            {INTERVALS.map((tf) => (
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
          {!isLive && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Chart range">
              {(isIntradayRangeInterval(timeframe) ? INTRADAY_RANGES : DAILY_RANGES).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className="rounded px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: range === r ? "var(--surface-2)" : "transparent",
                    color: range === r ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
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
                `Signal ${signal.status} · ${
                  tzReady ? formatInTimeZoneWithAbbr(signal.created_at, effectiveTimeZone, { style: "datetime", seconds: true }) : signal.created_at
                }`,
                `confidence ${signal.confidence.toFixed(0)} · model ${signal.model_version} · ${signal.data_source} (${signal.data_mode})`,
                ...(signal.rejection_reasons.length ? ["Rejections:", ...signal.rejection_reasons.map((r) => `· ${r}`)] : []),
                ...(signal.bullish_reasons.length ? ["For:", ...signal.bullish_reasons.slice(0, 3).map((r) => `· ${r}`)] : []),
              ].join("\n")}
            >
              {signal.status.replace(/_/g, " ")}
            </span>
          )}
          <span style={{ color: "var(--text-muted)" }}>
            {lastUpdate ? (
              `last update ${
                tzReady ? formatInTimeZone(lastUpdate, effectiveTimeZone, { style: "time", seconds: true }) : lastUpdate
              } ${tzReady ? abbreviation : ""}`
            ) : candles?.market_status && candles.market_status !== "open" ? (
              // Outside regular NYSE hours the live feed genuinely never
              // ticks (see services/market_overview.py's market_status) —
              // saying "waiting for first tick" forever is misleading, not
              // just impatient. Say plainly why nothing's arriving.
              <span className="font-semibold" style={{ color: "var(--status-critical)" }}>
                MARKET {candles.market_status.toUpperCase().replace("-", " ")} — no live ticks
              </span>
            ) : (
              "waiting for first tick…"
            )}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {OVERLAYS.map((o) => (
            <label key={o.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={activeOverlays.has(o.key)} onChange={() => toggleOverlay(o.key)} />
              {o.label}
            </label>
          ))}
        </div>
        <DrawingToolbar
          activeTool={drawTool}
          onSelectTool={handleSelectDrawTool}
          onClear={handleClearDrawings}
          hasDrawings={drawings.length > 0}
          pendingFirstPoint={pendingPoint !== null}
        />
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

      <div className="relative">
        <div ref={containerRef} className="content-reveal w-full" style={{ height: 420 }} />
        {hoveredMarker && <MarkerTooltip x={hoveredMarker.x} y={hoveredMarker.y} info={hoveredMarker.info} />}
      </div>
    </div>
  );
}

function MarkerTooltip({ x, y, info }: { x: number; y: number; info: MarkerTooltipInfo }) {
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-xs rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        left: x, top: y, transform: "translate(-50%, -110%)",
        background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-primary)",
      }}
    >
      {info.kind === "news" ? (
        <>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            📰 {info.article.headline}
          </p>
          <p className="mt-1" style={{ color: "var(--text-muted)" }}>
            {info.article.source} · sentiment {info.article.sentiment_label}
          </p>
        </>
      ) : info.vetoed ? (
        <>
          <p className="font-semibold" style={{ color: "var(--status-critical)" }}>
            VETOED — {info.signal.confirmed_verdict?.replace("_", " ")}
          </p>
          <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
            {info.signal.veto_reason ?? "Red-Team vetoed this signal."}
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            NCS {info.signal.confirmed_verdict?.replace("_", " ")}
          </p>
          <p className="mt-1" style={{ color: "var(--text-muted)" }}>
            confidence {info.signal.confidence_pct.toFixed(0)}% · risk {info.signal.risk_score.toFixed(0)}/100
          </p>
        </>
      )}
    </div>
  );
}
