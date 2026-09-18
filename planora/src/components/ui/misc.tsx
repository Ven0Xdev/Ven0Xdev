import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer rounded-control bg-surface-sunken", className)}
      aria-hidden
      {...props}
    />
  );
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-line",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  name,
  src,
  className,
  size = "md",
}: {
  name: string | null | undefined;
  src?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "size-6 text-[10px]",
    md: "size-8 text-[11px]",
    lg: "size-10 text-[13px]",
  };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-brand-50 font-semibold text-brand-700",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface-muted/60 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** מדד מספרי בכרטיס — משתמש ב-Inter למספר */
export function Metric({
  value,
  label,
  hint,
  tone = "default",
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    default: "text-ink",
    warning: "text-warning-700",
    danger: "text-danger-700",
    success: "text-success-700",
  }[tone];

  return (
    <div>
      <p className="text-[12px] font-medium text-ink-muted">{label}</p>
      <p className={cn("font-numeric mt-1 text-2xl leading-8 font-semibold", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl leading-7 font-semibold text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
