"use client";

import Link from "next/link";
import type { StockAnalysis } from "@/lib/types";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";

export function OpportunityTable({ rows }: { rows: StockAnalysis[] }) {
  if (rows.length === 0) {
    return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No opportunities matched the current filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--text-muted)" }}>
            <th className="px-4 py-2 font-medium">Ticker</th>
            <th className="px-4 py-2 font-medium">Price</th>
            <th className="px-4 py-2 font-medium">AI Score</th>
            <th className="px-4 py-2 font-medium">Confidence</th>
            <th className="px-4 py-2 font-medium">Manip. Risk</th>
            <th className="px-4 py-2 font-medium">P(+10%, primary horizon)</th>
            <th className="px-4 py-2 font-medium">R:R</th>
            <th className="px-4 py-2 font-medium">Hold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const primary = r.probability_matrix.find((p) => p.horizon_days === r.estimated_holding_period_days) ?? r.probability_matrix[0];
            return (
              <tr key={r.ticker} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-4 py-3">
                  <Link href={`/stock/${r.ticker}`} className="font-semibold hover:underline">
                    {r.ticker}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.sector}
                  </div>
                </td>
                <td className="px-4 py-3 tabular">${r.current_price.toFixed(4)}</td>
                <td className="px-4 py-3">
                  <Badge variant={scoreVariant(r.overall_ai_score)}>{r.overall_ai_score.toFixed(0)}</Badge>
                </td>
                <td className="px-4 py-3 tabular">{r.confidence_score.toFixed(0)}%</td>
                <td className="px-4 py-3">
                  <Badge variant={riskVariant(r.manipulation_risk)}>{r.manipulation_risk.toFixed(0)}</Badge>
                </td>
                <td className="px-4 py-3 tabular">{(primary.prob_up_10 * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 tabular">{r.expected_risk_reward.toFixed(2)}x</td>
                <td className="px-4 py-3 tabular">{r.estimated_holding_period_days}d</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
