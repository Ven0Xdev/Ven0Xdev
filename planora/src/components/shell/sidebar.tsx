"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Receipt,
  Settings,
  Store,
  UserCheck,
  Home,
  BarChart3,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/misc";
import { NAV_LABELS } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/session";

export interface NavCounts {
  reviews: number;
  consultants: number;
  pricing: number;
  myWork: number;
}

const NAV_ITEMS = [
  { href: "/", label: NAV_LABELS.dashboard, icon: LayoutDashboard, exact: true },
  { href: "/my-work", label: NAV_LABELS.myWork, icon: ListTodo, countKey: "myWork" },
  { href: "/projects", label: NAV_LABELS.projects, icon: Building2 },
  { href: "/apartments", label: NAV_LABELS.apartments, icon: Home },
  { href: "/reviews", label: NAV_LABELS.reviews, icon: ClipboardCheck, countKey: "reviews" },
  { href: "/consultants", label: NAV_LABELS.consultants, icon: UserCheck, countKey: "consultants" },
  { href: "/pricing", label: NAV_LABELS.pricing, icon: Receipt, countKey: "pricing" },
  { href: "/suppliers", label: NAV_LABELS.suppliers, icon: Store },
  { href: "/documents", label: NAV_LABELS.documents, icon: FileText },
  { href: "/reports", label: NAV_LABELS.reports, icon: BarChart3 },
  { href: "/learning-center", label: NAV_LABELS.learningCenter, icon: GraduationCap },
  { href: "/settings", label: NAV_LABELS.settings, icon: Settings },
] as const;

export function Sidebar({
  user,
  counts,
  onNavigate,
}: {
  user: { name: string; image: string | null; role: string; organization: string };
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-e border-line bg-surface">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="rounded-control" aria-label="OVIAX — לוח בקרה">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="ניווט ראשי">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              "exact" in item && item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const count =
              "countKey" in item && item.countKey
                ? counts[item.countKey as keyof NavCounts]
                : 0;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={count > 0 ? `${item.label}, ${count}` : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-brand-600" : "text-ink-subtle group-hover:text-ink-muted",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count > 0 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "font-numeric rounded-pill px-1.5 py-0.5 text-[11px] leading-4 font-semibold",
                        isActive ? "bg-brand-100 text-brand-700" : "bg-surface-sunken text-ink-muted",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-control px-2 py-2">
          <Avatar name={user.name} src={user.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-ink-muted">{user.role}</p>
            <p className="truncate text-[11px] text-ink-subtle">{user.organization}</p>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            התנתקות
          </button>
        </form>
      </div>
    </div>
  );
}
