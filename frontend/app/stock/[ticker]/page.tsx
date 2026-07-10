"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { StockAnalysis } from "@/lib/types";
import { ScoreMeter } from "@/components/ui/ScoreMeter";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { ProbabilityMatrix } from "@/components/dashboard/ProbabilityMatrix";
import { ManipulationPanel } from "@/components/dashboard/ManipulationPanel";
import { FactorsPanel } from "@/components/dashboard/FactorsPanel";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = params.ticker;
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
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
