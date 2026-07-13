"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Deliberation, NewsArticle, OhlcvBar, StockAnalysis } from "@/lib/types";
import { ScoreMeter } from "@/components/ui/ScoreMeter";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { DataBadge } from "@/components/ui/DataBadge";
import { PriceChart } from "@/components/charts/PriceChart";
import { LiveChart } from "@/components/charts/LiveChart";
import { ProbabilityMatrix } from "@/components/dashboard/ProbabilityMatrix";
import { ManipulationPanel } from "@/components/dashboard/ManipulationPanel";
import { FactorsPanel } from "@/components/dashboard/FactorsPanel";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = params.ticker;
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [bars, setBars] = useState<OhlcvBar[] | null>(null);
  const [news, setNews] = useState<NewsArticle[] | null>(null);
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .analysis(ticker)
      .then((data) => {
        if (!cancelled) setAnalysis(data);
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

  const addToWatchlist = async () => {
    setBusy(true);
    try {
      await api.addToWatchlist(ticker);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>;
  if (!analysis || analysis.ticker !== ticker.toUpperCase()) {
    return <p style={{ color: "var(--text-muted)" }}>Loading analysis for {ticker}…</p>;
  }

  const a = analysis;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="flex flex-col gap-6 xl:col-span-2">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold">{a.ticker}</h1>
                <Badge variant={scoreVariant(a.overall_ai_score)}>AI score {a.overall_ai_score.toFixed(0)}</Badge>
                <Badge variant={riskVariant(a.manipulation_risk)}>Manip. risk {a.manipulation_risk.toFixed(0)}</Badge>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {a.company_name} · {a.tier} · {a.sector}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-semibold tabular">${a.current_price.toFixed(4)}</div>
              <button
                onClick={addToWatchlist}
                disabled={busy}
                className="mt-1 rounded-lg px-3 py-1 text-xs font-medium"
                style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}
              >
                + Watchlist
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {a.explanation}
          </p>
          <div className="mt-3">
            <DataBadge mode={a.data_mode} source={a.data_source} asOf={a.as_of} priceAsOf={a.price_as_of} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Live intraday (1m) — streamed from backend, with Signal Engine levels
          </h2>
          <LiveChart symbol={a.ticker} />
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Price — last {bars?.length ?? "…"} sessions, with trade-plan levels
          </h2>
          {bars === null ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading price history…</p>
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

        <div className="card grid grid-cols-2 gap-5 p-5 sm:grid-cols-3">
          <ScoreMeter label="Technical" value={a.technical_score} />
          <ScoreMeter label="Fundamental" value={a.fundamental_score} />
          <ScoreMeter label="Sentiment" value={a.sentiment_score} />
          <ScoreMeter label="Catalyst" value={a.catalyst_score} />
          <ScoreMeter label="Liquidity" value={a.liquidity_score} />
          <ScoreMeter label="Confidence" value={a.confidence_score} variant="status" />
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Probability of upside, by horizon
          </h2>
          <ProbabilityMatrix rows={a.probability_matrix} />
          <p className="mt-3 text-sm tabular" style={{ color: "var(--text-secondary)" }}>
            Probability of drawdown before upside: <strong>{(a.probability_downside_before_upside * 100).toFixed(0)}%</strong>
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Trade plan
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <TradeStat label="Entry zone" value={`$${a.suggested_entry_zone_low.toFixed(4)} – $${a.suggested_entry_zone_high.toFixed(4)}`} />
            <TradeStat label="Ideal entry" value={`$${a.ideal_entry_price.toFixed(4)}`} />
            <TradeStat label="Stop loss" value={`$${a.stop_loss.toFixed(4)}`} accent="var(--status-critical)" />
            <TradeStat label="Take profit 1" value={`$${a.take_profit_1.toFixed(4)}`} accent="var(--status-good)" />
            <TradeStat label="Take profit 2" value={`$${a.take_profit_2.toFixed(4)}`} accent="var(--status-good)" />
            <TradeStat label="Take profit 3" value={`$${a.take_profit_3.toFixed(4)}`} accent="var(--status-good)" />
            <TradeStat label="Max allocation" value={`${a.max_allocation_pct.toFixed(2)}%`} />
            <TradeStat label="Risk/Reward" value={`${a.expected_risk_reward.toFixed(2)}x`} />
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            Estimated holding period: {a.estimated_holding_period_days} trading days. This is a suggested plan, not
            investment advice — size and manage risk according to your own tolerance.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            What&apos;s driving this score
          </h2>
          <FactorsPanel factors={a.top_factors} />
        </div>

        <div className="card p-5">
          <ManipulationPanel score={a.manipulation_risk} flags={a.manipulation_flags} />
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Multi-agent deliberation
          </h2>
          {deliberation === null ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Deliberation unavailable.</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={deliberation.verdict.stance === "favorable" || deliberation.verdict.stance === "constructive" ? "good" : deliberation.verdict.stance === "neutral" ? "warning" : "critical"}>
                  {deliberation.verdict.stance}
                </Badge>
                <span className="tabular text-xs" style={{ color: "var(--text-muted)" }}>
                  conviction {(deliberation.verdict.conviction * 100).toFixed(0)}%
                </span>
              </div>
              <p style={{ color: "var(--text-secondary)" }}>{deliberation.verdict.narrative}</p>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Contrarian findings
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {(deliberation.stages.find((s) => s.stage === "contradiction")?.evidence ?? []).map((e, i) => (
                    <li key={i} className="rounded-lg px-3 py-2" style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}>
                      {e.claim}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Invalidation conditions
                </h3>
                <ul className="list-disc pl-5" style={{ color: "var(--text-secondary)" }}>
                  {deliberation.verdict.invalidation_conditions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Recent news
          </h2>
          {news === null ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading news…</p>
          ) : news.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No recent coverage found by the active provider.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {news.map((n, i) => (
                <li key={i} className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--page-plane)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{n.headline}</span>
                    {n.is_promotional && <Badge variant="serious">promotional</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {n.source} · {n.published_at.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Sources &amp; timestamps: market data from &quot;{a.data_source}&quot; ({a.data_mode}); analysis computed{" "}
          {a.as_of ? new Date(a.as_of).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "at unknown time"}; last
          price bar {a.price_as_of ? new Date(a.price_as_of).toISOString().slice(0, 10) : "unknown"}. Probabilities are
          model estimates, never guarantees.
        </p>
      </div>

      <div className="xl:col-span-1">
        <div className="card sticky top-6 flex h-[640px] flex-col p-4">
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Ask the AI assistant about {a.ticker}
          </h2>
          <ChatWidget initialTicker={a.ticker} />
        </div>
      </div>
    </div>
  );
}

function TradeStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="tabular font-semibold" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
