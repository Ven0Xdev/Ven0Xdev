"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      dir="rtl"
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-72 rounded-control border border-line bg-ink px-2.5 py-1.5 text-[12px] leading-5 text-white shadow-overlay",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

/** עטיפה נוחה: טקסט עזר על אלמנט */
export function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
