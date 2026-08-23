"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoveragePanel } from "@/components/research/CoveragePanel";
import { ModelRegistryPanel } from "@/components/research/ModelRegistryPanel";
import { CanaryPanel } from "@/components/research/CanaryPanel";

type TabKey = "coverage" | "models" | "canary";
const TABS: { key: TabKey; label: string }[] = [
  { key: "coverage", label: "Dataset Coverage" },
  { key: "models", label: "Model Registry" },
  { key: "canary", label: "Research Canary" },
];

/** Phase 7 — the Historical Research dashboard. Everything here is
 * clearly separate from live NCS/Paper Trading/Shadow: historical model
 * markers, walk-forward results, and Canary status never mix with real
 * live NCS signals or manual/autonomous Paper Trading executions
 * anywhere on this platform (see components/paperTrading/
 * DecisionAuditPanel.tsx and TradingChart.tsx for those, untouched). */
export default function ResearchPage() {
  const [tab, setTab] = useState<TabKey>("coverage");
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    api.me().then((u) => setIsOperator(u.role === "operator")).catch(() => setIsOperator(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historical Research"
        description="Point-in-time historical learning and a tightly limited INTERNAL Paper Research Canary. Historical association is not proof of causation and never guarantees future profit. This never places a real broker order — see the Research Canary tab for its exact, backend-enforced limits."
      />

      <div className="flex flex-wrap gap-1 border-b" role="tablist" aria-label="Historical Research" style={{ borderColor: "var(--gridline)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="rounded-t-md px-3 py-2 text-xs font-semibold"
            style={{
              color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "coverage" && <CoveragePanel />}
      {tab === "models" && <ModelRegistryPanel />}
      {tab === "canary" && <CanaryPanel isOperator={isOperator} />}
    </div>
  );
}
