import type { HorizonProbabilities } from "@/lib/types";

export function ProbabilityMatrix({ rows }: { rows: HorizonProbabilities[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            <th className="py-2 pr-4">Horizon</th>
            <th className="py-2 pr-4">P(+5%)</th>
            <th className="py-2 pr-4">P(+10%)</th>
            <th className="py-2 pr-4">P(+20%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.horizon_days} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
              <td className="py-2.5 pr-4 font-semibold">{row.horizon_days} trading days</td>
              <td className="py-2.5 pr-4">{(row.prob_up_5 * 100).toFixed(0)}%</td>
              <td className="py-2.5 pr-4">{(row.prob_up_10 * 100).toFixed(0)}%</td>
              <td className="py-2.5 pr-4">{(row.prob_up_20 * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Statistical estimates from the model ensemble + Monte-Carlo forecasting. Not guarantees.
      </p>
    </div>
  );
}
