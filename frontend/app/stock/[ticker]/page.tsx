"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, getFetchMeta } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { Deliberation, NewsArticle, OhlcvBar, StockAnalysis } from "@/lib/types";
import { ScoreMeter } from "@/components/ui/ScoreMeter";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { DataBadge } from "@/components/ui/DataBadge";
import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";
import { PriceChart } from "@/components/charts/PriceChart";
import { LiveChart } from "@/components/charts/LiveChart";
import { ProbabilityMatrix } from "@/components/dashboard/ProbabilityMatrix";
import { ManipulationPanel } from "@/components/dashboard/ManipulationPanel";
import { FactorsPanel } from "@/components/dashboard/FactorsPanel";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { CacheBadge } from "@/components/pwa/CacheBadge";

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = params.ticker;
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [bars, setBars] = useState<OhlcvBar[] | null>(null);
  const [news, setNews] = useState<NewsArticle[] | null>(null);
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [analysisCachedAt, setAnalysisCachedAt] = useState<string | null>(null);

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
        if (!cancelled) setError(String(e));
      });
    api.ohlcv(ticker, 120).then((d) => !cancelled && setBars(d.bars)).catch(() => !cancelled && setBars([]));
    api.news(ticker, 8).then((d) => !cancelled && setNews(d)).catch(() => !cancelled && setNews([]));
    api.deliberation(ticker).then((d) => !cancelled && setDeliberation(d)).catch(() => !cancelled && setDeliberation(null));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  useEffect(load, [load]);
  useResyncListener(load); // re-fetch fresh data automatically when connectivity is verified back

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
    return (
      <div className="card animate-in p-5 text-sm" style={{ borderColor: "var(--status-critical-soft)" }}>
        <p className="font-semibold" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load {ticker.toUpperCase()}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{error}</p>
      </div>
    );
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
            <DataBadge mode={a.data_mode} source={a.data_source} asOf={a.as_of} priceAsOf={a.price_as_of} />
            {analysisCachedAt !== null && <CacheBadge cachedAt={analysisCachedAt} />}
          </div>
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>Live intraday (1m) — streamed from backend, with Signal Engine levels</SectionLabel>
          <LiveChart symbol={a.ticker} />
        </div>

        <div className="card animate-in p-5 sm:p-6">
          <SectionLabel>Price — last {bars?.length ?? "…"} sessions, with trade-plan levels</SectionLabel>
          {bars === null ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <PriceChart
              bars={bars}
              markers={[
                { label: "Entry", price: a.ideal_entry_price, color: "var(--series-blue)" },
                { label: "Stop", price: a.stop_loss, color: "var(--status-critical)" },
                { label: "TP1", price: a.take_profit_1, color: "var(--status-good)" },
                { label: "TP2", price: a.take_profit_2, color: "var(--status-good)" },
                { label: "TP3", price: a.take_profit_3, color: "var(--status-good)" },
              ]}
            />
          )}
        </div>

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
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge variant={deliberation.verdict.stance === "favorable" || deliberation.verdict.stance === "constructive" ? "good" : deliberation.verdict.stance === "neutral" ? "warning" : "critical"}>
                  {deliberation.verdict.stance}
                </Badge>
                <span className="tabular text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  conviction {(deliberation.verdict.conviction * 100).toFixed(0)}%
                </span>
              </div>
              <p style={{ color: "var(--text-secondary)" }}>{deliberation.verdict.narrative}</p>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Contrarian findings
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {(deliberation.stages.find((s) => s.stage === "contradiction")?.evidence ?? []).map((e, i) => (
                    <li key={i} className="rounded-[10px] px-3.5 py-2.5" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                      {e.claim}
                    </li>
                  ))}
                </ul>
              </div>
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
                    {n.source} · {n.published_at.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Sources &amp; timestamps: market data from &quot;{a.data_source}&quot; ({a.data_mode}); analysis computed{" "}
          {a.as_of ? new Date(a.as_of).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "at unknown time"}; last
          price bar {a.price_as_of ? new Date(a.price_as_of).toISOString().slice(0, 10) : "unknown"}. Probabilities are
          model estimates, never guarantees.
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
