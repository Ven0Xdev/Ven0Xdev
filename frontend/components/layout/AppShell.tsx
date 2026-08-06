"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { AuthGate } from "@/components/auth/AuthGate";
import { TickerTape } from "@/components/ui/TickerTape";

const PUBLIC_ROUTES = ["/login", "/register"];

/** Fixed, decorative-only backdrop — a few soft, slowly drifting gradient
 * blobs behind all content. aria-hidden + pointer-events:none so it never
 * competes with or intercepts real UI; opacity/animation both collapse
 * under prefers-reduced-motion (see globals.css). */
function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <span style={{ top: "-10%", left: "-8%", width: 420, height: 420, background: "var(--accent)", animationDelay: "0s" }} />
      <span style={{ top: "40%", right: "-12%", width: 460, height: 460, background: "var(--series-blue)", animationDelay: "-14s" }} />
      <span style={{ bottom: "-14%", left: "22%", width: 380, height: 380, background: "var(--series-violet)", animationDelay: "-28s" }} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (isPublicRoute) {
    // No nav chrome to show for a page whose whole purpose is "you aren't
    // signed in yet" — and nothing to gate, so AuthGate is skipped too.
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <AmbientBackground />
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <AmbientBackground />
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TickerTape />
        <main className="flex-1 p-4 sm:p-8 lg:p-10">
          <div className="mx-auto w-full max-w-7xl">
            <AuthGate>
              {/* Route content only — Sidebar/MobileNav/TickerTape stay
                  anchored and unanimated across navigations, per Next's
                  own view-transitions guide (persistent chrome must not
                  move during a route crossfade). */}
              <ViewTransition>{children}</ViewTransition>
            </AuthGate>
          </div>
        </main>
      </div>
    </div>
  );
}
