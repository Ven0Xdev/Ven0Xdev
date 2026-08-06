"use client";

import Link from "next/link";
import type { StockAnalysis } from "@/lib/types";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";

export function OpportunityTable({ rows }: { rows: StockAnalysis[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        No opportunities matched the current filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
            <th className="px-4 py-3 font-semibold">Ticker</th>
            <th className="px-4 py-3 font-semibold">Price</th>
            <th className="px-4 py-3 font-semibold">AI Score</th>
            <th className="px-4 py-3 font-semibold">Confidence</th>
            <th className="px-4 py-3 font-semibold">Manip. Risk</th>
            <th className="px-4 py-3 font-semibold">P(+10%, primary horizon)</th>
            <th className="px-4 py-3 font-semibold">R:R</th>
            <th className="px-4 py-3 font-semibold">Hold</th>
          </tr>
        </thead>
        <tbody className="animate-in-stagger">
          {rows.map((r) => {
            const primary = r.probability_matrix.find((p) => p.horizon_days === r.estimated_holding_period_days) ?? r.probability_matrix[0];
            return (
              <tr
                key={r.ticker}
                className="border-t"
                style={{ borderColor: "var(--gridline)", transition: "background-color var(--duration-fast) var(--ease-out)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="px-4 py-3">
                  <Link href={`/stock/${r.ticker}`} className="font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
                    {r.ticker}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.sector}
                  </div>
                </td>
                <td className="tabular px-4 py-3">${r.current_price.toFixed(4)}</td>
                <td className="px-4 py-3">
                  <Badge variant={scoreVariant(r.overall_ai_score)}>{r.overall_ai_score.toFixed(0)}</Badge>
                </td>
                <td className="tabular px-4 py-3">{r.confidence_score.toFixed(0)}%</td>
                <td className="px-4 py-3">
                  <Badge variant={riskVariant(r.manipulation_risk)}>{r.manipulation_risk.toFixed(0)}</Badge>
                </td>
                <td className="tabular px-4 py-3">{(primary.prob_up_10 * 100).toFixed(0)}%</td>
                <td className="tabular px-4 py-3">{r.expected_risk_reward.toFixed(2)}x</td>
                <td className="tabular px-4 py-3">{r.estimated_holding_period_days}d</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
