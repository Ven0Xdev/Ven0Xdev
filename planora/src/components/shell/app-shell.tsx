"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette, SearchTrigger } from "./command-palette";
import { NotificationsMenu, type NotificationItem } from "./notifications-menu";
import { Sidebar, type NavCounts } from "./sidebar";

export function AppShell({
  user,
  counts,
  notifications,
  children,
}: {
  user: { name: string; image: string | null; role: string; organization: string };
  counts: NavCounts;
  notifications: NotificationItem[];
  children: React.ReactNode;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh bg-canvas">
        {/* סרגל צד — בצד ימין */}
        <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">
          <Sidebar user={user} counts={counts} />
        </aside>

        {/* סרגל צד במובייל */}
        {isMobileNavOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="סגירת התפריט"
              className="absolute inset-0 bg-ink/25"
              onClick={() => setIsMobileNavOpen(false)}
            />
            <div className="absolute inset-y-0 start-0 w-72 shadow-overlay">
              <Sidebar
                user={user}
                counts={counts}
                onNavigate={() => setIsMobileNavOpen(false)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col lg:ms-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink lg:hidden"
              aria-label={isMobileNavOpen ? "סגירת התפריט" : "פתיחת התפריט"}
              onClick={() => setIsMobileNavOpen((value) => !value)}
            >
              {isMobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>

            <div className="flex min-w-0 flex-1 items-center">
              <SearchTrigger />
            </div>

            <NotificationsMenu items={notifications} />
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette />
    </TooltipProvider>
  );
}
