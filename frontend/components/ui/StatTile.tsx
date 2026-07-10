export function StatTile({
  label,
  value,
  delta,
  deltaGood,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaGood?: boolean;
}) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
      {delta && (
        <span
          className="text-sm font-medium"
          style={{ color: deltaGood ? "var(--status-good)" : "var(--status-critical)" }}
        >
          {delta}
        </span>
      )}
    </div>
  );
}
