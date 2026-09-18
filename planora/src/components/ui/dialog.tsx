"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { wide?: boolean }
>(({ className, children, wide, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
    <DialogPrimitive.Content
      ref={ref}
      dir="rtl"
      className={cn(
        "fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-y-1/2 translate-x-1/2 rounded-panel border border-line bg-surface shadow-overlay",
        "max-h-[88vh] overflow-y-auto",
        wide ? "max-w-3xl" : "max-w-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute end-4 top-4 rounded-control p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
        aria-label="סגירה"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-6 pt-6 pb-4", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold text-ink", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] leading-6 text-ink-muted", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-2", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-row-reverse items-center gap-2 border-t border-line bg-surface-muted/60 px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}
