"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { CalibrationBucketReport, CalibrationReport } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatTile } from "@/components/ui/StatTile";

export default function PerformancePage() {
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const load = useCallback(() => {
    api
      .calibrationReport()
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load);

  useEffect(() => {
    if (report !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [report, error]);

  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Model Performance"
        description="Every logged prediction is graded against what actually happened, once its horizon has elapsed — the honest measure of whether these probabilities mean anything. Never back-fit: an unmatured prediction has no outcome yet."
      />

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : report === null ? (
        loadingTooLong ? (
          <div className="card flex flex-col gap-2 p-5 text-sm">
            <p className="font-semibold">Still waiting on the performance report.</p>
            <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
              Retry
            </button>
          </div>
        ) : (
          <CardSkeleton lines={6} />
        )
      ) : report.total_scored === 0 ? (
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {report.note ?? "No matured predictions with outcomes yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Predictions scored" value={report.total_scored} />
            <StatTile label="Brier score (lower = better)" value={report.brier_score ?? 0} format={(n) => n.toFixed(4)} />
            <StatTile label="Stop-loss rate" value={(report.overall_stop_rate ?? 0) * 100} format={(n) => `${n.toFixed(1)}%`} />
            <StatTile label="Avg realized return" value={report.avg_realized_return_pct ?? 0} format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`} />
          </div>

          <CalibrationSection title="Overall calibration" report={report} />

          {Object.keys(report.by_engine_mode).length > 0 && (
            <div>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                By engine mode
              </h2>
              <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
                HEURISTIC is a hand-written feature formula, never a trained model. A TRAINED_ML model may only be
                promoted to production if it demonstrably beats HEURISTIC&apos;s Brier score here, out-of-sample.
              </p>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {Object.entries(report.by_engine_mode).map(([mode, r]) => (
                  <div key={mode} className="card animate-in p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold">{mode}</span>
                      <span className="tabular text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.total_scored} scored
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <MiniStat label="Brier score" value={r.brier_score.toFixed(4)} />
                      <MiniStat label="Stop rate" value={`${(r.overall_stop_rate * 100).toFixed(1)}%`} />
                      <MiniStat label="Avg return" value={`${r.avg_realized_return_pct >= 0 ? "+" : ""}${r.avg_realized_return_pct.toFixed(2)}%`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="tabular font-semibold">{value}</div>
    </div>
  );
}

function CalibrationSection({
  title,
  report,
}: {
  title: string;
  report: Pick<CalibrationBucketReport, "buckets">;
}) {
  const populated = report.buckets.filter((b) => b.count > 0);
  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {title} — predicted P(+10%) vs. realized frequency
      </h2>
      {populated.length === 0 ? (
        <div className="card animate-in p-6 text-sm" style={{ color: "var(--text-muted)" }}>
          No bucket has any matured predictions yet.
        </div>
      ) : (
        <div className="card animate-in flex flex-col gap-3 p-5">
          {populated.map((b) => (
            <div key={`${b.range[0]}-${b.range[1]}`} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                <span className="tabular">
                  {(b.range[0] * 100).toFixed(0)}–{(b.range[1] * 100).toFixed(0)}% predicted ({b.count} predictions)
                </span>
                <span className="tabular">
                  predicted {((b.avg_predicted_prob ?? 0) * 100).toFixed(0)}% · realized {((b.realized_frequency ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(b.avg_predicted_prob ?? 0) * 100}%`, background: "var(--series-blue)", opacity: 0.55 }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(b.realized_frequency ?? 0) * 100}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--series-blue)", opacity: 0.55 }} /> predicted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /> realized
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
