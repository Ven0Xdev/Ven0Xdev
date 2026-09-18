"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { formatRelative } from "@/lib/i18n/format";
import { markAllNotificationsRead } from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  isRead: boolean;
}

export function NotificationsMenu({ items }: { items: NotificationItem[] }) {
  const [isPending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `התראות — ${unread} חדשות` : "התראות"}
          className="relative flex size-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span className="font-numeric absolute -top-0.5 end-0.5 flex min-w-4 items-center justify-center rounded-pill bg-danger-600 px-1 text-[10px] leading-4 font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-semibold text-ink">התראות</p>
          {unread > 0 ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => void markAllNotificationsRead())}
              className="flex items-center gap-1 text-[12px] text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden />
              סימון הכל כנקרא
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-ink">אין התראות חדשות.</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              עדכונים על תוכניות, יועצים ותמחור יופיעו כאן.
            </p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((item) => {
              const content = (
                <div
                  className={cn(
                    "flex gap-2.5 px-4 py-3 transition-colors hover:bg-surface-muted",
                    !item.isRead && "bg-brand-50/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      item.isRead ? "bg-transparent" : "bg-brand-500",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-5 font-medium text-ink">
                      {item.title}
                    </span>
                    {item.body ? (
                      <span className="mt-0.5 block text-[12px] leading-5 text-ink-muted">
                        {item.body}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-ink-subtle">
                      {formatRelative(item.createdAt)}
                    </span>
                  </span>
                </div>
              );

              return (
                <li key={item.id} className="border-b border-line last:border-0">
                  {item.href ? <Link href={item.href}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
