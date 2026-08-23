export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
