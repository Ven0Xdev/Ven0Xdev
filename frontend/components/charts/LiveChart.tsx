"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "@/lib/api";
import type { SignalPayload, StreamBar } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type ConnState = "connecting" | "live" | "stale" | "disconnected";

const STATUS_COLORS: Record<string, string> = {
  POSSIBLE_ENTRY: "var(--status-good)",
  SETUP_FORMING: "var(--series-blue)",
  WATCH: "var(--status-warning)",
  NO_TRADE: "var(--text-muted)",
  AVOID: "var(--status-critical)",
  SIGNAL_INVALIDATED: "var(--status-critical)",
};

function toTime(iso: string): UTCTimestamp {
  return (Date.parse(iso) / 1000) as UTCTimestamp;
}

export function LiveChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const pendingBar = useRef<StreamBar | null>(null);

  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<string>("…");
  const [signal, setSignal] = useState<SignalPayload | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dark = document.documentElement.dataset.theme === "dark" ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light");

    const chart = createChart(el, {
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#c3c2b7" : "#52514e",
      },
      grid: {
        vertLines: { color: dark ? "#2c2c2a" : "#e1e0d9" },
        horzLines: { color: dark ? "#2c2c2a" : "#e1e0d9" },
      },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#0ca30c", downColor: "#d03b3b",
      wickUpColor: "#0ca30c", wickDownColor: "#d03b3b",
      borderVisible: false,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    candleRef.current = candles;

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol", priceFormat: { type: "volume" }, color: dark ? "#3987e5" : "#2a78d6",
    });
    volumeRef.current = volume;
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    let disposed = false;

    // Seed: intraday 1m bars accumulated by the backend stream service
    // (REST once) — streaming then only touches the newest bar.
    api.streamBars(symbol).then(({ bars }) => {
      if (disposed || !candleRef.current) return;
      candleRef.current.setData(bars.map((b) => ({
        time: toTime(b.start), open: b.open, high: b.high, low: b.low, close: b.close,
      })));
      volumeRef.current?.setData(bars.map((b) => ({ time: toTime(b.start), value: b.volume })));
      const last = bars[bars.length - 1];
      if (last) {
        setStreamMode(last.data_mode);
        setLastUpdate(last.last_update);
      }
    }).catch(() => { /* stream not yet warm — SSE will fill in */ });

    // Deterministic Signal Engine levels: evaluate once (idempotent — same
    // status reaffirms, never mutates history), then draw entry/stop/targets.
    api.evaluateSignal(symbol).then((s) => { if (!disposed) setSignal(s); })
      .catch(() => api.currentSignal(symbol).then((s) => { if (!disposed) setSignal(s); }).catch(() => {}));

    // Live stream over SSE; paint throttled to ~4 fps (backend accuracy
    // is preserved — only rendering is throttled).
    const es = new EventSource(`${API_BASE}/stream/${symbol}`);
    const paint = setInterval(() => {
      const bar = pendingBar.current;
      if (bar && candleRef.current) {
        candleRef.current.update({
          time: toTime(bar.start), open: bar.open, high: bar.high, low: bar.low, close: bar.close,
        });
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
      // Closed bars are final — paint immediately, bypassing the throttle.
      const bar = JSON.parse((e as MessageEvent).data).payload as StreamBar;
      candleRef.current?.update({
        time: toTime(bar.start), open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      });
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
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      priceLinesRef.current = [];
    };
  }, [symbol]);

  // Redraw Signal Engine level lines whenever the signal changes.
  useEffect(() => {
    const candles = candleRef.current;
    if (!candles) return;
    for (const line of priceLinesRef.current) candles.removePriceLine(line);
    priceLinesRef.current = [];
    if (!signal || signal.status === "NO_SIGNAL_YET") return;

    const lines: [string, number | null | undefined, string][] = [
      ["Entry", signal.ideal_entry, "#2a78d6"],
      ["Stop", signal.stop_loss, "#d03b3b"],
      ["TP1", signal.targets?.[0], "#0ca30c"],
      ["TP2", signal.targets?.[1], "#0ca30c"],
      ["TP3", signal.targets?.[2], "#0ca30c"],
    ];
    for (const [title, price, color] of lines) {
      if (price) {
        priceLinesRef.current.push(
          candles.createPriceLine({ price, color, lineStyle: 2, lineWidth: 1, title })
        );
      }
    }
  }, [signal]);

  const connColor = conn === "live" ? "var(--status-good)" : conn === "stale" ? "var(--status-warning)" : "var(--status-critical)";
  const statusColor = signal ? STATUS_COLORS[signal.status] ?? "var(--text-muted)" : "var(--text-muted)";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: connColor }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: connColor }} />
          {conn.toUpperCase()}
        </span>
        <span
          className="rounded-md px-2 py-0.5 font-semibold tracking-wide"
          style={{ color: "var(--status-warning)", background: "color-mix(in srgb, var(--status-warning) 14%, transparent)" }}
        >
          {conn !== "live"
            ? // Never claim LIVE/DELAYED once the stream has dropped — that
              // would present a stale, possibly cached last-known price as
              // if it were current. streamMode only reflects the *last*
              // event received, not what's on screen right now.
              "LAST KNOWN (not live)"
            : streamMode === "live"
              ? "LIVE FEED"
              : streamMode === "delayed"
                ? "DELAYED FEED"
                : "SYNTHETIC FEED"}
        </span>
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
          {lastUpdate ? `last update ${new Date(lastUpdate).toLocaleTimeString()}` : "waiting for first tick…"} · live bar: 1m
        </span>
      </div>
      <div ref={containerRef} className="w-full" />
      {signal && signal.rejection_reasons.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          No entry levels shown — Signal Engine rejections: {signal.rejection_reasons.join("; ")}
        </p>
      )}
    </div>
  );
}
