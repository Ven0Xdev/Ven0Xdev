"use client";

import { useMemo, useState } from "react";
import { Layers, SquareStack } from "lucide-react";

import { PlanViewer, type ViewerMode } from "@/components/drawing/plan-viewer";
import { CompareLegend } from "@/components/drawing/legend";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { ChangeItemView, ConsultantOption, PlanDocuments, WorkspacePermissions } from "./types";
import { ChangeDetail } from "./change-detail";
import { ChangeList } from "./change-list";

const MODES: { value: ViewerMode; label: string }[] = [
  { value: "STANDARD", label: "סטנדרט" },
  { value: "MODIFIED", label: "תוכנית שינויים" },
  { value: "COMPARE", label: "השוואה" },
];

const FILTERS = [
  { value: "ALL", label: "הכל" },
  { value: "PENDING", label: "ממתין לבדיקה" },
  { value: "CONSULTANT", label: "דורש יועץ" },
  { value: "DECIDED", label: "הוכרע" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

export function ChangesPanel({
  documents,
  changes,
  permissions,
  consultants,
  initialSelectedId,
}: {
  documents: PlanDocuments;
  changes: ChangeItemView[];
  permissions: WorkspacePermissions;
  consultants: ConsultantOption[];
  initialSelectedId?: string | null;
}) {
  const [mode, setMode] = useState<ViewerMode>("COMPARE");
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);

  const filtered = useMemo(() => {
    switch (filter) {
      case "PENDING":
        return changes.filter((change) => change.status === "DETECTED");
      case "CONSULTANT":
        return changes.filter(
          (change) => change.requiresConsultant || change.status === "AWAITING_CONSULTANT",
        );
      case "DECIDED":
        return changes.filter(
          (change) => change.status !== "DETECTED" && change.status !== "AWAITING_CONSULTANT",
        );
      default:
        return changes;
    }
  }, [changes, filter]);

  const selected = changes.find((change) => change.id === selectedId) ?? null;

  const viewerChanges = useMemo(
    () =>
      changes
        .filter((change) => change.elementId)
        .map((change) => ({
          id: change.id,
          code: change.code,
          elementId: change.elementId as string,
          type: change.type,
          description: change.description,
        })),
    [changes],
  );

  if (!documents.standard) {
    return (
      <EmptyState
        icon={<SquareStack className="size-5" />}
        title="אין עדיין תוכנית סטנדרט לדירה זו."
        description="לאחר העלאת תוכנית הסטנדרט ניתן יהיה להשוות אליה כל תוכנית שינויים."
      />
    );
  }

  if (changes.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="size-5" />}
        title="לא נמצאו שינויים מול תוכנית הסטנדרט."
        description="כשתועלה תוכנית שינויים חדשה, ההשוואה תופיע כאן."
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="מצב תצוגת התוכנית"
            className="inline-flex rounded-control border border-line-strong bg-surface p-0.5 shadow-subtle"
          >
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={mode === option.value}
                onClick={() => setMode(option.value)}
                disabled={option.value !== "STANDARD" && !documents.modified}
                className={cn(
                  "rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
                  mode === option.value
                    ? "bg-brand-600 text-white shadow-subtle"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="text-[13px] text-ink-soft">
            נמצאו <span className="font-numeric font-semibold text-ink">{changes.length}</span>{" "}
            שינויים
          </p>
        </div>

        <PlanViewer
          standard={documents.standard}
          modified={documents.modified}
          mode={mode}
          changes={viewerChanges}
          selectedChangeId={selectedId}
          onSelectChange={setSelectedId}
          className="h-[min(68vh,660px)]"
        />

        {mode === "COMPARE" ? <CompareLegend className="mt-3" /> : null}

        <p className="mt-3 text-[12px] leading-5 text-ink-subtle lg:hidden">
          לצפייה מלאה בתוכנית מומלץ להשתמש במחשב או בטאבלט.
        </p>
      </div>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {selected ? (
          <>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="border-b border-line px-4 py-2 text-right text-[12px] font-medium text-brand-600 transition-colors hover:bg-surface-muted"
            >
              חזרה לרשימת השינויים
            </button>
            <div className="min-h-0 flex-1">
              <ChangeDetail
                change={selected}
                permissions={permissions}
                consultants={consultants}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1 border-b border-line p-2">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  aria-pressed={filter === option.value}
                  className={cn(
                    "rounded-control px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    filter === option.value
                      ? "bg-surface-sunken text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="max-h-[min(62vh,600px)] min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
                  אין שינויים בקטגוריה זו.
                </p>
              ) : (
                <ChangeList changes={filtered} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
