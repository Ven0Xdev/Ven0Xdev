"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StockAnalysis } from "@/lib/types";
import { OpportunityTable } from "@/components/dashboard/OpportunityTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";

export default function OpportunitiesPage() {
  const [rows, setRows] = useState<StockAnalysis[] | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [maxRisk, setMaxRisk] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRows = () => {
    api
      .opportunities(50)
      .then((r) => {
        setRows(r);
        setRefreshing(false);
      })
      .catch((e) => {
        setError(String(e));
        setRefreshing(false);
      });
  };

  const refresh = () => {
    setRefreshing(true);
    fetchRows();
  };

  useEffect(fetchRows, []);

  const filtered = rows?.filter((r) => r.overall_ai_score >= minScore && r.manipulation_risk <= maxRisk) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Opportunities"
        description="Full OTC universe, ranked by overall AI score. Filter by minimum score and maximum manipulation risk."
      />

      <div className="card animate-in flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <label className="flex items-center gap-3 text-sm font-medium">
          Min AI score
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="tabular w-7 text-right font-semibold" style={{ color: "var(--accent)" }}>
            {minScore}
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm font-medium">
          Max manipulation risk
          <input
            type="range"
            min={0}
            max={100}
            value={maxRisk}
            onChange={(e) => setMaxRisk(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="tabular w-7 text-right font-semibold" style={{ color: "var(--accent)" }}>
            {maxRisk}
          </span>
        </label>
        <button onClick={refresh} disabled={refreshing} className="btn btn-primary ml-auto">
          {refreshing ? "Scanning…" : "Refresh scan"}
        </button>
      </div>

      {filtered === null && !error ? (
        <CardSkeleton lines={6} />
      ) : (
        <div className="card animate-in overflow-hidden">
          {error ? (
            <p className="p-6 text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>
          ) : (
            <OpportunityTable rows={filtered!} />
          )}
        </div>
      )}
    </div>
  );
}
