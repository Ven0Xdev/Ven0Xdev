export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** A generic card-shaped loading placeholder — swap in wherever a page
 * currently renders a bare "Loading…" string, so the wait itself feels
 * considered rather than empty. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}
