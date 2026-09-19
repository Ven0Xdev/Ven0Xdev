"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Compass, Eye, Loader2, Moon, Sun, Sunrise, Sunset } from "lucide-react";

import { Skeleton } from "@/components/ui/misc";
import { SCENE_LIGHTING, resolveMaterials, type ProductMaterial } from "@/lib/three/materials";
import { buildSceneModel } from "@/lib/three/scene-model";
import type { DrawingDocument } from "@/lib/drawing/types";
import { SCENE_TIME_LABELS, type SceneTime } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import type { CameraMode } from "./apartment-scene";

/** הסצנה נטענת רק כשצריך אותה — שלא להעמיס את טעינת הדף */
const ApartmentScene = dynamic(
  () => import("./apartment-scene").then((module) => module.ApartmentScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface-muted">
        <p className="flex items-center gap-2 text-[13px] text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          טוען את הדירה...
        </p>
      </div>
    ),
  },
);

const TIME_ICONS: Record<SceneTime, typeof Sun> = {
  MORNING: Sunrise,
  MIDDAY: Sun,
  SUNSET: Sunset,
  NIGHT: Moon,
};

export function Apartment3DViewer({
  document,
  materials,
  onSelectCategory,
  selectedCategory,
  className,
}: {
  document: DrawingDocument;
  materials: ProductMaterial[];
  onSelectCategory?: (category: string, label: string) => void;
  selectedCategory?: string | null;
  className?: string;
}) {
  const [sceneTime, setSceneTime] = useState<SceneTime>("MIDDAY");
  const [cameraMode, setCameraMode] = useState<CameraMode>("ORBIT");
  const [showLabels, setShowLabels] = useState(true);

  const model = useMemo(() => buildSceneModel(document), [document]);
  const resolved = useMemo(() => resolveMaterials(materials), [materials]);
  const lighting = SCENE_LIGHTING[sceneTime];

  return (
    <div className={cn("relative overflow-hidden rounded-card border border-line", className)}>
      <ApartmentScene
        model={model}
        materials={resolved}
        lighting={lighting}
        cameraMode={cameraMode}
        selectedCategory={selectedCategory ?? null}
        onSelect={onSelectCategory}
        showRoomLabels={showLabels}
      />

      {/* שעה ביום */}
      <div
        className="absolute top-3 start-3 flex items-center gap-0.5 rounded-control border border-line bg-surface/92 p-0.5 shadow-card backdrop-blur-sm"
        role="group"
        aria-label="שעה ביום"
      >
        {(Object.keys(SCENE_TIME_LABELS) as SceneTime[]).map((time) => {
          const Icon = TIME_ICONS[time];
          return (
            <button
              key={time}
              type="button"
              onClick={() => setSceneTime(time)}
              aria-pressed={sceneTime === time}
              title={SCENE_TIME_LABELS[time]}
              className={cn(
                "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                sceneTime === time
                  ? "bg-brand-600 text-white"
                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{SCENE_TIME_LABELS[time]}</span>
            </button>
          );
        })}
      </div>

      {/* מצב מצלמה */}
      <div className="absolute top-3 end-3 flex items-center gap-0.5 rounded-control border border-line bg-surface/92 p-0.5 shadow-card backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setCameraMode("ORBIT")}
          aria-pressed={cameraMode === "ORBIT"}
          className={cn(
            "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            cameraMode === "ORBIT"
              ? "bg-surface-sunken text-ink"
              : "text-ink-muted hover:text-ink",
          )}
        >
          <Compass className="size-3.5" aria-hidden />
          סיבוב
        </button>
        <button
          type="button"
          onClick={() => setCameraMode("WALK")}
          aria-pressed={cameraMode === "WALK"}
          className={cn(
            "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            cameraMode === "WALK" ? "bg-surface-sunken text-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          <Eye className="size-3.5" aria-hidden />
          סיור
        </button>
      </div>

      <div className="absolute bottom-3 start-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowLabels((value) => !value)}
          aria-pressed={showLabels}
          className="rounded-control border border-line bg-surface/92 px-2.5 py-1.5 text-[11px] text-ink-muted shadow-card backdrop-blur-sm transition-colors hover:text-ink"
        >
          {showLabels ? "הסתר שמות חדרים" : "הצג שמות חדרים"}
        </button>
      </div>

      <p className="absolute bottom-3 end-3 max-w-56 rounded-control bg-surface/88 px-2.5 py-1.5 text-[11px] leading-4 text-ink-muted shadow-subtle backdrop-blur-sm">
        התצוגה ממחישה את מפרט הדירה. הגימור הסופי נקבע במפרט הטכני ובתוכניות
        המאושרות.
      </p>
    </div>
  );
}

export function Apartment3DSkeleton() {
  return <Skeleton className="h-[min(62vh,560px)] w-full rounded-card" />;
}
