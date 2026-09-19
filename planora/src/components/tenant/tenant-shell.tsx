"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Box,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  Map,
  Receipt,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/misc";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TENANT_NAV_LABELS } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/session";

const NAV = [
  { href: "/tenant", label: TENANT_NAV_LABELS.overview, icon: Home, exact: true },
  { href: "/tenant/apartment", label: TENANT_NAV_LABELS.apartment, icon: LayoutGrid },
  { href: "/tenant/view", label: TENANT_NAV_LABELS.view3d, icon: Box },
  { href: "/tenant/plans", label: TENANT_NAV_LABELS.plans, icon: Map },
  { href: "/tenant/changes", label: TENANT_NAV_LABELS.changes, icon: Wrench },
  { href: "/tenant/selections", label: TENANT_NAV_LABELS.selections, icon: Sparkles },
  { href: "/tenant/pricing", label: TENANT_NAV_LABELS.pricing, icon: Receipt },
  { href: "/tenant/documents", label: TENANT_NAV_LABELS.documents, icon: FileText },
  { href: "/tenant/notifications", label: TENANT_NAV_LABELS.notifications, icon: Bell },
] as const;

export function TenantShell({
  user,
  apartmentLabel,
  projectName,
  brandColor,
  unreadCount,
  children,
}: {
  user: { name: string; image: string | null };
  apartmentLabel: string;
  projectName: string;
  brandColor?: string | null;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="flex min-h-dvh flex-col bg-canvas"
        style={brandColor ? ({ "--brand-accent": brandColor } as React.CSSProperties) : undefined}
      >
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/tenant" className="rounded-control" aria-label="OVIAX">
              <Logo />
            </Link>

            <div className="flex items-center gap-3">
              <div className="hidden text-left sm:block">
                <p className="text-[13px] font-medium text-ink">{apartmentLabel}</p>
                <p className="text-[11px] text-ink-muted">{projectName}</p>
              </div>
              <Avatar name={user.name} src={user.image} />
              <form action={signOutAction}>
                <button
                  type="submit"
                  aria-label="התנתקות"
                  title="התנתקות"
                  className="flex size-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            </div>
          </div>

          <nav
            aria-label="ניווט"
            className="mx-auto flex w-full max-w-6xl gap-0.5 overflow-x-auto px-4 sm:px-6"
          >
            {NAV.map((item) => {
              const isActive =
                "exact" in item && item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              const badge = item.href === "/tenant/notifications" ? (unreadCount ?? 0) : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={badge > 0 ? `${item.label}, ${badge}` : undefined}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-2.5 py-3 text-[13px] font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                  {badge > 0 ? (
                    <span
                      aria-hidden
                      className="font-numeric rounded-pill bg-danger-600 px-1.5 text-[10px] leading-4 font-semibold text-white"
                    >
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-9">
          {children}
        </main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
            <p className="text-[11px] leading-5 text-ink-subtle">
              המחירים והאפשרויות המוצגים כאן נקבעים על ידי יזם הפרויקט וספקיו. בחירה
              שנשלחת לבדיקה נבדקת על ידי מנהלת שינויי הדיירים לפני אישור סופי.
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
