"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Compass, Eye, Loader2, Moon, Sun, Sunrise, Sunset } from "lucide-react";

import { Skeleton } from "@/components/ui/misc";
import type { DrawingDocument } from "@/lib/drawing/types";
import { SCENE_TIME_LABELS } from "@/lib/i18n/he";
import type { SceneModel } from "@/lib/three/scene-model";
import { useApartmentVisualization } from "@/lib/visualization/use-visualization";
import type { MaterialAssignment, TimeOfDay } from "@/lib/visualization/types";
import { cn } from "@/lib/utils";

/**
 * תצוגת הדירה.
 *
 * הרכיב אינו מדבר עם מנוע תלת-ממד מסוים: הוא צורך את `ApartmentVisualizationProvider`
 * דרך `useApartmentVisualization`, ומתפצל בנקודה אחת בלבד — `presentation.kind` —
 * בין סצנה שמרונדרת בדפדפן לבין זרם וידאו ממנוע רינדור מרוחק.
 */

/** הסצנה המקומית נטענת רק כשצריך אותה — שלא להעמיס את טעינת הדף */
const ApartmentScene = dynamic(
  () => import("./apartment-scene").then((module) => module.ApartmentScene),
  {
    ssr: false,
    loading: () => <ViewerMessage>טוען את הדירה...</ViewerMessage>,
  },
);

const TIME_ICONS: Record<TimeOfDay, typeof Sun> = {
  MORNING: Sunrise,
  MIDDAY: Sun,
  SUNSET: Sunset,
  NIGHT: Moon,
};

function ViewerMessage({ children, spinner = true }: { children: React.ReactNode; spinner?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted p-6">
      <p className="flex items-center gap-2 text-center text-[13px] text-ink-muted">
        {spinner ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {children}
      </p>
    </div>
  );
}

export function Apartment3DViewer({
  apartmentId,
  document,
  materials,
  onSelectCategory,
  selectedCategory,
  className,
}: {
  apartmentId: string;
  document: DrawingDocument;
  materials: MaterialAssignment[];
  onSelectCategory?: (category: string, label: string) => void;
  selectedCategory?: string | null;
  className?: string;
}) {
  const { state, capabilities, setTimeOfDay, startWalkthrough, stopWalkthrough } =
    useApartmentVisualization({ apartmentId, document, materials });
  const [showLabels, setShowLabels] = useState(true);

  const presentation = state.presentation;
  const isReady = state.status === "READY" && presentation !== null;

  return (
    <div className={cn("relative overflow-hidden rounded-card border border-line", className)}>
      {presentation?.kind === "LOCAL_SCENE" ? (
        <ApartmentScene
          // ענף הסצנה המקומית — כאן, ורק כאן, ידוע מהו טיפוס המודל
          model={presentation.scene as SceneModel}
          materials={presentation.materials}
          lighting={presentation.lighting}
          cameraMode={state.cameraMode}
          selectedCategory={selectedCategory ?? null}
          onSelect={onSelectCategory}
          showRoomLabels={showLabels}
        />
      ) : presentation?.kind === "REMOTE_STREAM" ? (
        // מנוע מרוחק מזרים וידאו. הנגן עצמו ייכנס יחד עם המימוש שלו.
        <ViewerMessage spinner={false}>
          {state.message ?? "מתחבר לשרת ההדמיה..."}
        </ViewerMessage>
      ) : (
        <ViewerMessage spinner={state.status === "LOADING"}>
          {state.status === "LOADING" || state.status === "IDLE"
            ? "טוען את הדירה..."
            : (state.message ?? "לא ניתן להציג את הדירה כרגע.")}
        </ViewerMessage>
      )}

      {isReady ? (
        <>
          {/* שעה ביום */}
          <div
            className="absolute top-3 start-3 flex items-center gap-0.5 rounded-control border border-line bg-surface/92 p-0.5 shadow-card backdrop-blur-sm"
            role="group"
            aria-label="שעה ביום"
          >
            {(Object.keys(SCENE_TIME_LABELS) as TimeOfDay[]).map((time) => {
              const Icon = TIME_ICONS[time];
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => setTimeOfDay(time)}
                  aria-pressed={state.timeOfDay === time}
                  title={SCENE_TIME_LABELS[time]}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    state.timeOfDay === time
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

          {/* מצב מצלמה — מוצג רק כאשר המנוע יודע לסייר בדירה */}
          {capabilities?.walkthrough ? (
            <div className="absolute top-3 end-3 flex items-center gap-0.5 rounded-control border border-line bg-surface/92 p-0.5 shadow-card backdrop-blur-sm">
              <button
                type="button"
                onClick={stopWalkthrough}
                aria-pressed={state.cameraMode === "ORBIT"}
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  state.cameraMode === "ORBIT"
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <Compass className="size-3.5" aria-hidden />
                סיבוב
              </button>
              <button
                type="button"
                onClick={startWalkthrough}
                aria-pressed={state.cameraMode === "WALK"}
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  state.cameraMode === "WALK"
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <Eye className="size-3.5" aria-hidden />
                סיור
              </button>
            </div>
          ) : null}

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
        </>
      ) : null}
    </div>
  );
}

export function Apartment3DSkeleton() {
  return <Skeleton className="h-[min(62vh,560px)] w-full rounded-card" />;
}
