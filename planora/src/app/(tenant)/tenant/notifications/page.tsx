import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { MarkAllReadButton } from "@/components/tenant/mark-all-read";
import { EmptyState } from "@/components/ui/misc";
import { getCurrentUser } from "@/lib/auth/session";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { formatRelative } from "@/lib/i18n/format";
import { getTenantNotifications } from "@/server/queries/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "התראות" };

export default async function TenantNotificationsPage() {
  await requireTenantApartment();
  const user = await getCurrentUser();
  const notifications = user ? await getTenantNotifications(user.id) : [];
  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl leading-7 font-semibold text-ink">התראות</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            עדכונים על הדירה שלך: בחירות, בקשות, תמחור ואישורים.
          </p>
        </div>
        {unread > 0 ? <MarkAllReadButton /> : null}
      </header>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title="אין עדיין התראות."
          description="כשיהיה עדכון בדירה שלך, הוא יופיע כאן."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => {
            const content = (
              <div
                className={cn(
                  "rounded-card border px-4 py-3.5 transition-colors",
                  notification.readAt
                    ? "border-line bg-surface"
                    : "border-brand-200 bg-brand-50/50",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      notification.readAt ? "bg-transparent" : "bg-brand-500",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-5 font-medium text-ink">
                      {notification.title}
                    </p>
                    {notification.body ? (
                      <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">
                        {notification.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      {formatRelative(notification.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );

            return (
              <li key={notification.id}>
                {notification.href ? (
                  <Link href={notification.href}>{content}</Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
