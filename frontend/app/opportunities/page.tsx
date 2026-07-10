"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StockAnalysis } from "@/lib/types";
import { OpportunityTable } from "@/components/dashboard/OpportunityTable";

export default function OpportunitiesPage() {
  const [rows, setRows] = useState<StockAnalysis[] | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [maxRisk, setMaxRisk] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = () => {
    api
      .opportunities(50)
      .then(setRows)
      .catch((e) => setError(String(e)));
  };

  const refresh = () => {
    setRows(null);
    fetchRows();
  };

  useEffect(fetchRows, []);

  const filtered = rows?.filter((r) => r.overall_ai_score >= minScore && r.manipulation_risk <= maxRisk) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Full OTC universe, ranked by overall AI score. Filter by minimum score and maximum manipulation risk.
        </p>
      </div>

      <div className="card flex flex-wrap items-center gap-6 p-4">
        <label className="flex items-center gap-2 text-sm">
          Min AI score
          <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          <span className="tabular w-8">{minScore}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Max manipulation risk
          <input type="range" min={0} max={100} value={maxRisk} onChange={(e) => setMaxRisk(Number(e.target.value))} />
          <span className="tabular w-8">{maxRisk}</span>
        </label>
        <button onClick={refresh} className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--series-blue)", color: "#fff" }}>
          Refresh scan
        </button>
      </div>

      <div className="card">
        {error ? (
          <p className="p-6 text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>
        ) : filtered === null ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Scanning universe…</p>
        ) : (
          <OpportunityTable rows={filtered} />
        )}
      </div>
    </div>
  );
}
