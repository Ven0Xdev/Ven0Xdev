"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BetaBadge, NexoraMark, SidebarBody, SidebarFooter } from "./Sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LogoutButton } from "@/components/auth/LogoutButton";

/** Top bar + slide-in drawer, visible only below the `sm` breakpoint where
 * the persistent Sidebar hides itself. Without this, phones had no way to
 * navigate, search, or reach the theme toggle at all. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Close on route change (covers link clicks inside the drawer and the
  // browser back/forward buttons alike). Deferred to a microtask so this
  // reads as syncing from an external system, not a synchronous
  // effect-body setState.
  useEffect(() => {
    Promise.resolve().then(() => setOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const openButton = openButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      openButton?.focus();
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <div
        className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
      >
        <div className="flex items-center gap-2.5">
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-ghost btn-sm"
            style={{ width: 36, height: 36, padding: 0 }}
            aria-label="Open navigation menu"
            aria-expanded={open}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
          <NexoraMark size={7} />
          <span className="text-[15px] font-semibold tracking-tight">Nexora</span>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-1">
          <LogoutButton />
          <ThemeToggle />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="animate-in absolute inset-0"
            style={{ background: "rgba(0,0,0,0.4)", animationDuration: "var(--duration-base)" }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute inset-y-0 left-0 flex w-[85%] max-w-[320px] flex-col p-4"
            style={{
              background: "var(--surface-1)",
              borderRight: "1px solid var(--border)",
              animation: "slide-in-left var(--duration-base) var(--ease-out) both",
            }}
          >
            <div className="mb-5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <NexoraMark />
                <span className="text-[15px] font-semibold tracking-tight">Nexora</span>
                <BetaBadge />
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost btn-sm"
                style={{ width: 32, height: 32, padding: 0 }}
                aria-label="Close navigation menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SidebarBody onNavigate={() => setOpen(false)} />
            <SidebarFooter />
          </div>
        </div>
      )}
    </div>
  );
}
