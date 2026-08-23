"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ResearchFamilyResult, ResearchModelDetail, ResearchModelSummary } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

const STATE_COLORS: Record<string, string> = {
  RESEARCH: "var(--text-muted)",
  HISTORICALLY_QUALIFIED: "var(--status-good)",
  REJECTED_OVERFIT: "var(--status-critical)",
  LIVE_SHADOW: "var(--series-blue)",
  LIVE_QUALIFIED: "var(--status-good)",
  RETIRED: "var(--text-muted)",
};

function FamilyRow({ result }: { result: ResearchFamilyResult }) {
  return (
    <tr className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
      <td className="px-3 py-2 font-semibold capitalize">{result.family}</td>
      <td className="px-3 py-2">{result.n_train} / {result.n_test}</td>
      <td className="px-3 py-2">{result.buy_auc != null ? result.buy_auc.toFixed(3) : "—"}</td>
      <td className="px-3 py-2">{result.buy_calibration_gap != null ? result.buy_calibration_gap.toFixed(3) : "—"}</td>
      <td className="px-3 py-2">{result.n_trades}</td>
      <td className="px-3 py-2" style={{ color: result.expectancy_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
        {result.expectancy_pct >= 0 ? "+" : ""}{result.expectancy_pct.toFixed(3)}%
      </td>
      <td className="px-3 py-2">{result.sharpe_per_trade.toFixed(2)}</td>
      <td className="px-3 py-2" style={{ color: "var(--status-critical)" }}>{result.max_drawdown_pct.toFixed(2)}%</td>
      <td className="px-3 py-2">{result.win_rate_pct.toFixed(0)}%</td>
    </tr>
  );
}

function ModelDetail({ modelId, onClose }: { modelId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<ResearchModelDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.researchModelDetail(modelId).then((d) => (setDetail(d), setError(null))).catch((e) => setError(e));
  }, [modelId]);

  if (error) return <ErrorState error={error} onRetry={() => setError(null)} />;
  if (!detail) return <CardSkeleton lines={6} />;

  const holdout = "result" in detail.holdout_report ? detail.holdout_report : null;
  const stress = "normal_costs" in detail.stress_test_report ? detail.stress_test_report : null;

  return (
    <div className="card animate-in flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {detail.family} · {detail.horizon} · v{detail.version}
        </h3>
        <button onClick={onClose} className="text-xs" style={{ color: "var(--text-muted)" }}>Close ✕</button>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {detail.dataset_summary.n_samples.toLocaleString()} samples across {detail.dataset_summary.n_symbols_with_data} symbols ·
        BUY {detail.dataset_summary.label_distribution.BUY} / SELL {detail.dataset_summary.label_distribution.SELL} / NO_TRADE {detail.dataset_summary.label_distribution.NO_TRADE}
      </p>

      {detail.rejection_reason && (
        <p className="rounded-md p-3 text-xs" style={{ background: "var(--surface-2)", color: "var(--status-critical)" }}>
          {detail.rejection_reason}
        </p>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Walk-forward folds (each family, trained through year N, tested on year N+1)
        </h4>
        {detail.walk_forward_report.folds.filter((f) => f.families.length > 0).length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>No fold produced enough purged training data yet.</p>
        ) : (
          detail.walk_forward_report.folds.filter((f) => f.families.length > 0).map((fold) => (
            <div key={fold.test_year} className="mb-3 overflow-x-auto">
              <p className="mb-1 text-xs font-semibold">
                Train through {fold.train_through_year} → test {fold.test_year} ({fold.n_train_after_purge} train rows after purge/embargo, {fold.n_train_before_purge} before)
              </p>
              <table className="w-full min-w-[820px] text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                    <th className="px-3 py-1.5">Family</th>
                    <th className="px-3 py-1.5">Train/Test rows</th>
                    <th className="px-3 py-1.5">Buy AUC</th>
                    <th className="px-3 py-1.5">Calib. gap</th>
                    <th className="px-3 py-1.5">Trades</th>
                    <th className="px-3 py-1.5">Expectancy</th>
                    <th className="px-3 py-1.5">Sharpe/trade</th>
                    <th className="px-3 py-1.5">Max DD</th>
                    <th className="px-3 py-1.5">Win rate</th>
                  </tr>
                </thead>
                <tbody>{fold.families.map((f) => <FamilyRow key={f.family} result={f} />)}</tbody>
              </table>
            </div>
          ))
        )}
        {detail.walk_forward_report.selected_family && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Selected: <strong>{detail.walk_forward_report.selected_family}</strong> — {detail.walk_forward_report.selection_rationale}.
            Deflated Sharpe probability: <strong>{detail.walk_forward_report.deflated_sharpe_probability?.toFixed(3) ?? "—"}</strong> across{" "}
            {detail.walk_forward_report.n_trials_for_dsr} trials.
          </p>
        )}
      </div>

      {holdout && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Untouched final holdout ({holdout.holdout_range[0].slice(0, 10)} → {holdout.holdout_range[1].slice(0, 10)}) — evaluated exactly once
          </h4>
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <th className="px-3 py-1.5">Family</th>
                <th className="px-3 py-1.5">Train/Test rows</th>
                <th className="px-3 py-1.5">Buy AUC</th>
                <th className="px-3 py-1.5">Calib. gap</th>
                <th className="px-3 py-1.5">Trades</th>
                <th className="px-3 py-1.5">Expectancy</th>
                <th className="px-3 py-1.5">Sharpe/trade</th>
                <th className="px-3 py-1.5">Max DD</th>
                <th className="px-3 py-1.5">Win rate</th>
              </tr>
            </thead>
            <tbody><FamilyRow result={holdout.result} /></tbody>
          </table>
        </div>
      )}

      {stress && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Cost-sensitivity stress test (doubled spread/slippage, same holdout)
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md p-3" style={{ background: "var(--surface-2)" }}>
              <p style={{ color: "var(--text-muted)" }}>Normal costs</p>
              <p className="text-sm font-semibold">{stress.normal_costs.expectancy_pct.toFixed(3)}% expectancy</p>
            </div>
            <div className="rounded-md p-3" style={{ background: "var(--surface-2)" }}>
              <p style={{ color: "var(--text-muted)" }}>Doubled costs</p>
              <p className="text-sm font-semibold" style={{ color: stress.doubled_costs.expectancy_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                {stress.doubled_costs.expectancy_pct.toFixed(3)}% expectancy
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Leakage self-checks</h4>
        <pre className="overflow-x-auto rounded-md p-3 text-[11px]" style={{ background: "var(--surface-2)" }}>
          {JSON.stringify(detail.leakage_checks, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export function ModelRegistryPanel() {
  const [models, setModels] = useState<ResearchModelSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = () => {
    api.researchModels().then((r) => (setModels(r), setError(null))).catch((e) => setError(e));
  };
  useEffect(load, []);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!models) return <CardSkeleton lines={5} />;

  return (
    <div className="flex flex-col gap-4">
      {models.length === 0 ? (
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No research model has been trained yet. An operator can start a walk-forward training run per horizon.
          </p>
        </div>
      ) : (
        <div className="card animate-in overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <th className="px-3 py-2">Family</th>
                <th className="px-3 py-2">Horizon</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Samples</th>
                <th className="px-3 py-2">Trained</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-3 py-2 font-semibold capitalize">{m.family}</td>
                  <td className="px-3 py-2">{m.horizon}</td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
                      style={{ color: STATE_COLORS[m.state], background: "color-mix(in srgb, currentColor 12%, transparent)" }}
                    >
                      {m.state.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">{m.dataset_summary.n_samples?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <LocalTime iso={m.trained_at} options={{ style: "short" }} />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setSelectedId(m.id)} className="btn btn-ghost btn-sm">Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId !== null && <ModelDetail modelId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
