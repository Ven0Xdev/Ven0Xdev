"use client";

import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export function DropdownMenu(
  props: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Root>,
) {
  return <DropdownPrimitive.Root dir="rtl" {...props} />;
}
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-52 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-overlay",
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] text-ink-soft outline-none transition-colors",
      "data-[highlighted]:bg-surface-sunken data-[highlighted]:text-ink",
      destructive && "text-danger-600 data-[highlighted]:bg-danger-50 data-[highlighted]:text-danger-700",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-2.5 py-1.5 text-[11px] font-semibold text-ink-subtle", className)} {...props} />
  );
}

export const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Separator ref={ref} className={cn("my-1 h-px bg-line", className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
