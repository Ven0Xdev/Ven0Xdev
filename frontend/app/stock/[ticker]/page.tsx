"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, getFetchMeta } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { Deliberation, NewsArticle, SignalPayload, StockAnalysis } from "@/lib/types";
import { ScoreMeter } from "@/components/ui/ScoreMeter";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { DataBadge } from "@/components/ui/DataBadge";
import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { SignalReveal } from "@/components/ui/SignalReveal";
import { TradingChart } from "@/components/charts/TradingChart";
import { NcsPanel } from "@/components/dashboard/NcsPanel";
import { NewsPanel } from "@/components/dashboard/NewsPanel";
import { ShadowTrackRecordPanel } from "@/components/dashboard/ShadowTrackRecordPanel";
import { ProbabilityMatrix } from "@/components/dashboard/ProbabilityMatrix";
import { ManipulationPanel } from "@/components/dashboard/ManipulationPanel";
import { FactorsPanel } from "@/components/dashboard/FactorsPanel";
import { AgentDeliberationSequence } from "@/components/dashboard/AgentDeliberationSequence";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { CacheBadge } from "@/components/pwa/CacheBadge";
import { LocalTime } from "@/components/ui/LocalTime";
import { useTimezone } from "@/components/providers/TimezoneProvider";
import { formatInTimeZone } from "@/lib/timezone";

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = params.ticker;
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [news, setNews] = useState<NewsArticle[] | null>(null);
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [analysisCachedAt, setAnalysisCachedAt] = useState<string | null>(null);
  const [liveSignal, setLiveSignal] = useState<SignalPayload | null>(null);
  const { effectiveTimeZone, abbreviation, ready: tzReady } = useTimezone();

  const load = useCallback(() => {
    let cancelled = false;
    api
      .analysis(ticker)
      .then((data) => {
        if (cancelled) return;
        setAnalysis(data);
        setError(null);
        const meta = getFetchMeta(`/stocks/${ticker}/analysis`);
        setAnalysisCachedAt(meta?.offline ? meta.cachedAt : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    api.news(ticker, 8).then((d) => !cancelled && setNews(d)).catch(() => !cancelled && setNews([]));
    api.deliberation(ticker).then((d) => !cancelled && setDeliberation(d)).catch(() => !cancelled && setDeliberation(null));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  useEffect(load, [load]);
  useResyncListener(load); // re-fetch fresh data automatically when connectivity is verified back

  const retry = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  const addToWatchlist = async () => {
    setBusy(true);
    try {
      await api.addToWatchlist(ticker);
      setWatchlisted(true);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <ErrorState error={error} onRetry={retry} />;
  }
  if (!analysis || analysis.ticker !== ticker.toUpperCase()) {
    return <StockDetailSkeleton />;
  }

  const a = analysis;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="flex flex-col gap-6 xl:col-span-2">
        <div className="card animate-in p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[26px] font-semibold tracking-tight">{a.ticker}</h1>
                <Badge variant={scoreVariant(a.overall_ai_score)}>AI score {a.overall_ai_score.toFixed(0)}</Badge>
                <Badge variant={riskVariant(a.manipulation_risk)}>Manip. risk {a.manipulation_risk.toFixed(0)}</Badge>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {a.company_name} · {a.tier} · {a.sector}
              </p>
            </div>
            <div className="text-right">
              <div className="tabular text-[32px] font-semibold leading-none tracking-tight">${a.current_price.toFixed(4)}</div>
              <button onClick={addToWatchlist} disabled={busy || watchlisted} className="btn btn-secondary btn-sm mt-2.5">
                {watchlisted ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Watchlisted
                  </>
                ) : (
                  "+ Watchlist"
                )}
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {a.explanation}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DataBadge
              mode={a.data_mode}
              source={a.data_source}
              asOf={a.as_of}
              priceAsOf={a.price_as_of}
              engineMode={a.engine_mode}
              modelVersion={a.model_version}
            />
            {analysisCachedAt !== null && <CacheBadge cachedAt={analysisCachedAt} />}
          </div>
        </div>

        {liveSignal && liveSignal.status !== "NO_SIGNAL_YET" && (
          <SignalReveal key={liveSignal.status} signal={liveSignal} />
        )}

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>
            Price chart — timeframes, indicators, and trade-plan levels · &quot;1m&quot; streams live from the backend
            with Signal Engine levels
          </SectionLabel>
          <TradingChart
            symbol={a.ticker}
            onSignal={setLiveSignal}
            tradePlan={[
              { label: "Entry", price: a.ideal_entry_price },
              { label: "Stop", price: a.stop_loss },
              { label: "TP1", price: a.take_profit_1 },
              { label: "TP2", price: a.take_profit_2 },
              { label: "TP3", price: a.take_profit_3 },
            ]}
          />
        </div>

        <NcsPanel symbol={a.ticker} />
        <ShadowTrackRecordPanel symbol={a.ticker} />
        <NewsPanel symbol={a.ticker} />

        <div className="card animate-in-stagger grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 sm:p-6">
          <ScoreMeter label="Technical" value={a.technical_score} />
          <ScoreMeter label="Fundamental" value={a.fundamental_score} />
          <ScoreMeter label="Sentiment" value={a.sentiment_score} />
          <ScoreMeter label="Catalyst" value={a.catalyst_score} />
          <ScoreMeter label="Liquidity" value={a.liquidity_score} />
          <ScoreMeter label="Confidence" value={a.confidence_score} variant="status" />
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>Probability of upside, by horizon</SectionLabel>
          <ProbabilityMatrix rows={a.probability_matrix} />
          <p className="mt-3 text-sm tabular" style={{ color: "var(--text-secondary)" }}>
            Probability of drawdown before upside: <strong>{(a.probability_downside_before_upside * 100).toFixed(0)}%</strong>
          </p>
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>Trade plan</SectionLabel>
          <div className="grid grid-cols-2 gap-5 text-sm sm:grid-cols-4">
            <TradeStat label="Entry zone" value={`$${a.suggested_entry_zone_low.toFixed(4)} – $${a.suggested_entry_zone_high.toFixed(4)}`} />
            <TradeStat label="Ideal entry" value={`$${a.ideal_entry_price.toFixed(4)}`} />
            <TradeStat label="Stop loss" value={`$${a.stop_loss.toFixed(4)}`} accent="var(--status-critical)" />
            <TradeStat label="Take profit 1" value={`$${a.take_profit_1.toFixed(4)}`} accent="var(--status-good)" />
            <TradeStat label="Take profit 2" value={`$${a.take_profit_2.toFixed(4)}`} accent="var(--status-good)" />
            <TradeStat label="Take profit 3" value={`$${a.take_profit_3.toFixed(4)}`} accent="var(--status-good)" />
            <TradeStat label="Max allocation" value={`${a.max_allocation_pct.toFixed(2)}%`} />
            <TradeStat label="Risk/Reward" value={`${a.expected_risk_reward.toFixed(2)}x`} />
          </div>
          <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Estimated holding period: {a.estimated_holding_period_days} trading days. This is a suggested plan, not
            investment advice — size and manage risk according to your own tolerance.
          </p>
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>What&apos;s driving this score</SectionLabel>
          <FactorsPanel factors={a.top_factors} />
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <ManipulationPanel score={a.manipulation_risk} flags={a.manipulation_flags} />
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>Multi-agent deliberation</SectionLabel>
          {deliberation === null ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Deliberation unavailable.</p>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <AgentDeliberationSequence deliberation={deliberation} />
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Invalidation conditions
                </h3>
                <ul className="list-disc space-y-1 pl-5" style={{ color: "var(--text-secondary)" }}>
                  {deliberation.verdict.invalidation_conditions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>Recent news</SectionLabel>
          {news === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : news.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No recent coverage found by the active provider.</p>
          ) : (
            <ul className="animate-in-stagger flex flex-col gap-2">
              {news.map((n, i) => (
                <li key={i} className="rounded-[10px] px-3.5 py-3 text-sm" style={{ background: "var(--surface-2)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{n.headline}</span>
                    {n.is_promotional && <Badge variant="serious">promotional</Badge>}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {n.source} · <LocalTime iso={n.published_at} options={{ style: "date" }} showAbbreviation={false} fallback={n.published_at.slice(0, 10)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Sources &amp; timestamps: market data from &quot;{a.data_source}&quot; ({a.data_mode}); analysis computed{" "}
          {a.as_of && tzReady
            ? `${formatInTimeZone(a.as_of, effectiveTimeZone, { style: "datetime" })} ${abbreviation}`
            : "at unknown time"}
          ; last price bar{" "}
          {a.price_as_of && tzReady ? formatInTimeZone(a.price_as_of, effectiveTimeZone, { style: "date" }) : "unknown"}. Probabilities come
          from {a.engine_mode === "TRAINED_ML" ? `a trained ML model (version ${a.model_version ?? "unknown"})` : "a heuristic feature formula, not a trained ML model"},
          and are estimates, never guarantees.
        </p>
      </div>

      <div className="xl:col-span-1">
        <div className="card animate-in sticky top-6 flex h-[640px] flex-col p-4">
          <h2 className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Ask the AI assistant about {a.ticker}
          </h2>
          <ChatWidget initialTicker={a.ticker} />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
      {children}
    </h2>
  );
}

function TradeStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="tabular mt-0.5 font-semibold" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function StockDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="flex flex-col gap-6 xl:col-span-2">
        <div className="card flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-16 w-full" />
        </div>
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </div>
      <CardSkeleton lines={8} />
    </div>
  );
}
