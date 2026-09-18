import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { ACTIVITY_KIND_LABELS } from "@/lib/i18n/he";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import type { ActivityKind } from "@prisma/client";

export interface ActivityView {
  id: string;
  kind: ActivityKind;
  message: string;
  userName: string | null;
  createdAt: Date;
}

export function HistoryPanel({ activities }: { activities: ActivityView[] }) {
  if (activities.length === 0) {
    return (
      <EmptyState
        title="עדיין לא נרשמה פעילות בדירה זו."
        description="כל העלאת תוכנית, בדיקה, אישור ותמחור יתועדו כאן."
      />
    );
  }

  const groups = new Map<string, ActivityView[]>();
  for (const activity of activities) {
    const key = formatDate(activity.createdAt);
    const list = groups.get(key) ?? [];
    list.push(activity);
    groups.set(key, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>יומן פעילות</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-6">
          {[...groups.entries()].map(([date, items]) => (
            <section key={date}>
              <h3 className="font-numeric mb-3 text-[12px] font-semibold text-ink-muted">{date}</h3>
              <ol className="space-y-3 border-s border-line ps-4">
                {items.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span
                      className="absolute -start-[21px] top-1.5 size-2 rounded-full border-2 border-surface bg-brand-400"
                      aria-hidden
                    />
                    <div className="flex items-start gap-2.5">
                      <Avatar name={activity.userName ?? "מערכת"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-5 text-ink-soft">{activity.message}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-subtle">
                          <span>{ACTIVITY_KIND_LABELS[activity.kind]}</span>
                          <span aria-hidden>·</span>
                          <span className="font-numeric">{formatDateTime(activity.createdAt)}</span>
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
