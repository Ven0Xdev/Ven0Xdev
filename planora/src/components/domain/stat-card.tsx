import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

const TONE_STYLES = {
  neutral: "text-ink",
  brand: "text-brand-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
  success: "text-success-700",
  consultant: "text-consultant-700",
} as const;

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: keyof typeof TONE_STYLES;
  icon?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        {icon ? <span className="text-ink-subtle">{icon}</span> : null}
      </div>
      <p className={cn("font-numeric mt-2 text-[28px] leading-9 font-semibold", TONE_STYLES[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] leading-5 text-ink-subtle">{hint}</p> : null}
      {href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-brand-600">
          מעבר
          <ArrowLeft className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "block rounded-card border border-line bg-surface px-5 py-4 shadow-card transition-colors",
    href && "hover:border-line-strong hover:bg-surface-muted/60",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
