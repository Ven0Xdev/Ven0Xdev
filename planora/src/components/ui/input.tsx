import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-9.5 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink shadow-subtle transition-colors",
        "placeholder:text-ink-subtle",
        "focus-visible:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-200",
        "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-20 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm leading-6 text-ink shadow-subtle transition-colors",
      "placeholder:text-ink-subtle",
      "focus-visible:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-200",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9.5 w-full appearance-none rounded-control border border-line-strong bg-surface px-3 text-sm text-ink shadow-subtle transition-colors",
      "bg-[length:14px] bg-[position:left_0.75rem_center] bg-no-repeat pl-8",
      "focus-visible:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-200",
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b727e' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e\")",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[13px] font-medium text-ink-soft", className)}
      {...props}
    />
  );
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[12px] leading-5 text-ink-muted", className)} {...props} />;
}
