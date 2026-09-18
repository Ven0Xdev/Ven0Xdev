import { cn } from "@/lib/utils";

/**
 * סימן Planora — תוכנית קומה מופשטת: מסגרת, קיר פנימי ופתח.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-8", className)}
      aria-hidden
      focusable="false"
    >
      <rect
        x="3.25"
        y="3.25"
        width="25.5"
        height="25.5"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M12.5 3.5v13.5H29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12.5 23.5H29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <circle cx="12.5" cy="23.5" r="2.25" fill="currentColor" />
    </svg>
  );
}

export function Logo({
  className,
  showName = true,
}: {
  className?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5 text-brand-700", className)}>
      <LogoMark />
      {showName ? (
        <span className="font-numeric text-[17px] leading-none font-semibold tracking-tight text-ink">
          Planora
        </span>
      ) : null}
    </span>
  );
}
