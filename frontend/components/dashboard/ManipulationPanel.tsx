import type { ManipulationFlag } from "@/lib/types";
import { Badge, riskVariant } from "@/components/ui/Badge";

export function ManipulationPanel({ score, flags }: { score: number; flags: ManipulationFlag[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Manipulation risk</span>
        <Badge variant={riskVariant(score)}>{score.toFixed(0)}/100</Badge>
      </div>
      {flags.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No active manipulation flags detected.
        </p>
      ) : (
        <ul className="animate-in-stagger flex flex-col gap-2">
          {flags.map((f) => (
            <li key={f.code} className="rounded-[10px] p-3.5 text-sm" style={{ background: "var(--surface-2)" }}>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold capitalize">{f.code.replace(/_/g, " ")}</span>
                <span className="tabular text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  severity {f.severity.toFixed(0)}
                </span>
              </div>
              <p style={{ color: "var(--text-secondary)" }}>{f.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
