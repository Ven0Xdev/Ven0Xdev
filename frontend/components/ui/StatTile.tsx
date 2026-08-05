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
    <div className="card flex flex-col gap-2.5 p-5">
      <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="tabular text-[28px] font-semibold leading-none tracking-tight" style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
      {delta && (
        <span
          className="tabular inline-flex w-fit items-center gap-1 text-[13px] font-semibold"
          style={{ color: deltaGood ? "var(--status-good)" : "var(--status-critical)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: deltaGood ? "none" : "rotate(180deg)" }}>
            <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {delta}
        </span>
      )}
    </div>
  );
}
