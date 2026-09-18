import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white shadow-subtle hover:bg-brand-700 active:bg-brand-800",
        secondary:
          "bg-surface text-ink border border-line-strong shadow-subtle hover:bg-surface-muted active:bg-surface-sunken",
        outline:
          "border border-line-strong text-ink-soft hover:bg-surface-muted hover:text-ink",
        ghost: "text-ink-soft hover:bg-surface-sunken hover:text-ink",
        danger: "bg-danger-600 text-white shadow-subtle hover:bg-danger-700",
        success: "bg-success-600 text-white shadow-subtle hover:bg-success-700",
        consultant: "bg-consultant-600 text-white shadow-subtle hover:bg-consultant-700",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-9.5 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px]",
        icon: "h-9 w-9 [&_svg]:size-4",
        iconSm: "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
