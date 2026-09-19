"use client";

import { useState } from "react";

import { Apartment3DViewer } from "@/components/three/apartment-3d-viewer";
import { PlanViewer } from "@/components/drawing/plan-viewer";
import { EmptyState } from "@/components/ui/misc";
import type { DrawingDocument } from "@/lib/drawing/types";
import type { ProductMaterial } from "@/lib/three/materials";
import { cn } from "@/lib/utils";

type Version = "ORIGINAL" | "MINE";

/**
 * תצוגת הדירה לדייר.
 * מעבר בין "הדירה המקורית" (מפרט הסטנדרט) לבין "הדירה שלי" (עם הבחירות),
 * כדי שהדייר יבין בדיוק מה השתנה.
 */
export function ApartmentView({
  standardDocument,
  currentDocument,
  materials,
  mode,
}: {
  standardDocument: DrawingDocument | null;
  currentDocument: DrawingDocument | null;
  materials: ProductMaterial[];
  mode: "3D" | "2D";
}) {
  const [version, setVersion] = useState<Version>("MINE");

  const document = version === "ORIGINAL" ? standardDocument : (currentDocument ?? standardDocument);
  const activeMaterials = version === "ORIGINAL" ? [] : materials;

  if (!document) {
    return (
      <EmptyState
        title="התוכנית עדיין לא זמינה לצפייה."
        description="לאחר שתוכנית הדירה תיטען למערכת, היא תופיע כאן."
      />
    );
  }

  const hasTwoVersions = Boolean(standardDocument && currentDocument);

  return (
    <div>
      {hasTwoVersions || materials.length > 0 ? (
        <div className="mb-3 inline-flex rounded-control border border-line-strong bg-surface p-0.5 shadow-subtle">
          {(
            [
              { value: "ORIGINAL" as Version, label: "הדירה המקורית" },
              { value: "MINE" as Version, label: "הדירה שלי" },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setVersion(option.value)}
              aria-pressed={version === option.value}
              className={cn(
                "rounded-[6px] px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                version === option.value
                  ? "bg-brand-600 text-white"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "3D" ? (
        <Apartment3DViewer
          document={document}
          materials={activeMaterials}
          className="h-[min(64vh,600px)]"
        />
      ) : (
        <PlanViewer standard={document} mode="STANDARD" className="h-[min(64vh,600px)]" />
      )}

      <p className="mt-3 text-[12px] leading-5 text-ink-muted lg:hidden">
        לחוויה מלאה מומלץ להשתמש במחשב או בטאבלט.
      </p>
    </div>
  );
}
