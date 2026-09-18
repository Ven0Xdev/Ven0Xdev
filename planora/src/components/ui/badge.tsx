import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/i18n/he";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface-sunken text-ink-soft",
        brand: "border-brand-200 bg-brand-50 text-brand-700",
        success: "border-success-100 bg-success-50 text-success-700",
        warning: "border-warning-100 bg-warning-50 text-warning-700",
        danger: "border-danger-100 bg-danger-50 text-danger-700",
        consultant: "border-consultant-100 bg-consultant-50 text-consultant-700",
      },
      size: {
        sm: "px-2 py-0 text-[11px]",
        md: "",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: StatusTone;
  /** נקודת צבע קטנה לפני הטקסט */
  dot?: boolean;
}

const DOT_COLORS: Record<StatusTone, string> = {
  neutral: "bg-ink-subtle",
  brand: "bg-brand-500",
  success: "bg-success-600",
  warning: "bg-warning-600",
  danger: "bg-danger-600",
  consultant: "bg-consultant-600",
};

export function Badge({ className, tone = "neutral", size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot ? (
        <span className={cn("size-1.5 rounded-full", DOT_COLORS[tone])} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
