"use client";

import { AlertTriangle, Lock, MessageSquare, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ChangeTypeBadge, ConfidenceBadge } from "@/components/domain/status-badges";
import { CHANGE_CATEGORY_LABELS, CHANGE_ITEM_STATUS_LABELS } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import type { ChangeItemView } from "./types";

export function ChangeList({
  changes,
  selectedId,
  onSelect,
}: {
  changes: ChangeItemView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const grouped = new Map<string, ChangeItemView[]>();
  for (const change of changes) {
    const key = change.categoryKey;
    const list = grouped.get(key) ?? [];
    list.push(change);
    grouped.set(key, list);
  }

  return (
    <div className="divide-y divide-line">
      {[...grouped.entries()].map(([categoryKey, items]) => (
        <section key={categoryKey}>
          <h3 className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface-muted/95 px-3.5 py-2 backdrop-blur-sm">
            <span className="text-[12px] font-semibold text-ink-soft">
              {CHANGE_CATEGORY_LABELS[categoryKey as keyof typeof CHANGE_CATEGORY_LABELS]}
            </span>
            <span className="font-numeric text-[11px] text-ink-subtle">{items.length}</span>
          </h3>

          <ul>
            {items.map((change) => (
              <li key={change.id}>
                <button
                  type="button"
                  onClick={() => onSelect(change.id)}
                  aria-current={selectedId === change.id}
                  className={cn(
                    "w-full border-s-2 px-3.5 py-3 text-right transition-colors",
                    selectedId === change.id
                      ? "border-s-brand-600 bg-brand-50/60"
                      : "border-s-transparent hover:bg-surface-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-5 font-medium text-ink">
                        {change.description}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                        <span className="font-numeric">{change.code}</span>
                        {change.roomLabel ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{change.roomLabel}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <ChangeTypeBadge type={change.type} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConfidenceBadge confidence={change.confidence} showValue={false} />
                    <Badge tone="neutral" size="sm">
                      {CHANGE_ITEM_STATUS_LABELS[change.status]}
                    </Badge>
                    {change.requiresConsultant ? (
                      <span
                        className="text-consultant-600"
                        title="נדרש אישור יועץ"
                        aria-label="נדרש אישור יועץ"
                      >
                        <UserCheck className="size-3.5" />
                      </span>
                    ) : null}
                    {change.blockedFromAutomation ? (
                      <span className="text-danger-600" title="חוסם המשך תהליך" aria-label="חוסם המשך תהליך">
                        <Lock className="size-3.5" />
                      </span>
                    ) : null}
                    {change.ruleHits.some((hit) => hit.severity === "WARNING") ? (
                      <span className="text-warning-600" title="נדלק כלל פרויקט" aria-label="נדלק כלל פרויקט">
                        <AlertTriangle className="size-3.5" />
                      </span>
                    ) : null}
                    {change.comments.length > 0 ? (
                      <span
                        className="flex items-center gap-0.5 text-ink-subtle"
                        title={`${change.comments.length} הערות`}
                      >
                        <MessageSquare className="size-3.5" />
                        <span className="font-numeric text-[11px]">{change.comments.length}</span>
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
