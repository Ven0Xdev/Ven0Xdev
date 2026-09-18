import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrapper({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-x-auto rounded-card border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full border-collapse text-right text-sm", className)} {...props} />
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("sticky top-0 z-10 bg-surface-muted/95 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-4 py-2.5 text-right text-[12px] font-semibold tracking-wide text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle text-ink-soft", className)} {...props} />;
}
