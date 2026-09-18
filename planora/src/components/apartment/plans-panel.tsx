"use client";

import { useState } from "react";
import { FileText, GitBranch } from "lucide-react";

import { PlanVersionStatusBadge } from "@/components/domain/status-badges";
import { PlanViewer } from "@/components/drawing/plan-viewer";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import type { DrawingDocument } from "@/lib/drawing/types";
import { formatDate } from "@/lib/i18n/format";
import { FILE_KIND_LABELS, PLAN_KIND_LABELS } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import type { PlanVersionStatus, PlanKind, FileKind } from "@prisma/client";

export interface PlanVersionView {
  id: string;
  versionNo: number;
  title: string;
  status: PlanVersionStatus;
  planKind: PlanKind;
  notes: string | null;
  authorName: string | null;
  createdAt: Date;
  isCurrent: boolean;
  document: DrawingDocument | null;
  files: { id: string; originalName: string; kind: FileKind }[];
}

export function PlansPanel({ versions }: { versions: PlanVersionView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    versions.find((version) => version.isCurrent)?.id ?? versions[0]?.id ?? null,
  );

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-5" />}
        title="עדיין לא הועלו תוכניות לדירה זו."
        description="תוכנית הסטנדרט של הטיפוס ותוכניות השינויים יופיעו כאן לפי גרסאות."
      />
    );
  }

  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <GitBranch className="size-4 text-ink-subtle" aria-hidden />
          <h3 className="text-[13px] font-semibold text-ink">גרסאות התוכנית</h3>
        </div>

        <ol className="divide-y divide-line">
          {versions.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => setSelectedId(version.id)}
                aria-current={selected.id === version.id}
                className={cn(
                  "w-full border-s-2 px-4 py-3 text-right transition-colors",
                  selected.id === version.id
                    ? "border-s-brand-600 bg-brand-50/50"
                    : "border-s-transparent hover:bg-surface-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-numeric rounded-control bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">
                      v{version.versionNo}
                    </span>
                    <span className="text-[13px] font-medium text-ink">{version.title}</span>
                  </span>
                  {version.isCurrent ? (
                    <Badge tone="brand" size="sm">
                      נוכחית
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {PLAN_KIND_LABELS[version.planKind]} ·{" "}
                  <span className="font-numeric">{formatDate(version.createdAt)}</span>
                  {version.authorName ? ` · ${version.authorName}` : ""}
                </p>

                <div className="mt-2">
                  <PlanVersionStatusBadge status={version.status} />
                </div>

                {version.notes ? (
                  <p className="mt-2 text-[12px] leading-5 text-ink-muted">{version.notes}</p>
                ) : null}

                {version.files.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {version.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-1.5 text-[11px] text-ink-subtle"
                      >
                        <FileText className="size-3" aria-hidden />
                        <span className="truncate">{file.originalName}</span>
                        <span>({FILE_KIND_LABELS[file.kind]})</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-w-0">
        {selected.document ? (
          <PlanViewer
            standard={selected.document}
            mode="STANDARD"
            className="h-[min(68vh,660px)]"
          />
        ) : (
          <EmptyState
            title="לגרסה זו אין מודל אלמנטים."
            description="ניתן לצפות בקובץ המקור. הפקת מודל מקבצי DWG או Revit תתאפשר בגרסה עתידית."
          />
        )}
      </div>
    </div>
  );
}
