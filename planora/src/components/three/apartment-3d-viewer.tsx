"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Compass,
  Eye,
  Maximize2,
  Minimize2,
  Moon,
  PlayCircle,
  Settings2,
  StopCircle,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";

import { Skeleton } from "@/components/ui/misc";
import type { DrawingDocument } from "@/lib/drawing/types";
import { SCENE_TIME_LABELS } from "@/lib/i18n/he";
import type { SceneModel } from "@/lib/three/scene-model";
import { QUALITY_LABELS, QUALITY_SETTINGS, type ResolvedQuality } from "@/lib/visualization/quality";
import { useApartmentVisualization } from "@/lib/visualization/use-visualization";
import type {
  ExteriorEnvironment,
  MaterialAssignment,
  TimeOfDay,
} from "@/lib/visualization/types";
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
  { ssr: false, loading: () => <PreparingApartment /> },
);

const TIME_ICONS: Record<TimeOfDay, typeof Sun> = {
  MORNING: Sunrise,
  MIDDAY: Sun,
  SUNSET: Sunset,
  NIGHT: Moon,
};

const QUALITY_ORDER: ResolvedQuality[] = ["HIGH", "BALANCED", "PERFORMANCE"];

const PANEL =
  "rounded-control border border-line bg-surface/92 shadow-card backdrop-blur-sm";
const CHIP =
  "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors";

/** מסך ההכנה — הדייר רואה משפט אחד, לא מונה אחוזים טכני */
function PreparingApartment({ message }: { message?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-muted p-6">
      <p className="text-[13px] font-medium text-ink">{message ?? "מכין את הדירה שלך..."}</p>
      <div className="h-1 w-40 overflow-hidden rounded-pill bg-surface-sunken">
        <div className="h-full w-1/3 animate-[loading-sweep_1.4s_ease-in-out_infinite] rounded-pill bg-brand-600" />
      </div>
      <style>{`@keyframes loading-sweep {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }`}</style>
    </div>
  );
}

function ViewerNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted p-6">
      <p className="max-w-sm text-center text-[13px] leading-6 text-ink-muted">{children}</p>
    </div>
  );
}

export function Apartment3DViewer({
  apartmentId,
  document,
  materials,
  environment,
  onSelectCategory,
  selectedCategory,
  className,
}: {
  apartmentId: string;
  document: DrawingDocument;
  materials: MaterialAssignment[];
  environment?: ExteriorEnvironment | null;
  onSelectCategory?: (category: string, label: string) => void;
  selectedCategory?: string | null;
  className?: string;
}) {
  const {
    state,
    capabilities,
    setTimeOfDay,
    focusRoom,
    startWalkthrough,
    stopWalkthrough,
    setQualityMode,
  } = useApartmentVisualization({ apartmentId, document, materials, environment });

  const [showLabels, setShowLabels] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const presentation = state.presentation;
  const isReady = state.status === "READY" && presentation !== null;
  const isTouring = state.tourPath.length > 0;

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(globalThis.document?.fullscreenElement));
    globalThis.document?.addEventListener("fullscreenchange", onChange);
    return () => globalThis.document?.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    if (globalThis.document?.fullscreenElement) {
      void globalThis.document.exitFullscreen();
    } else {
      void element.requestFullscreen?.();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-card border border-line bg-surface-muted",
        isFullscreen && "h-screen w-screen rounded-none",
        className,
      )}
    >
      {presentation?.kind === "LOCAL_SCENE" ? (
        <ApartmentScene
          // ענף הסצנה המקומית — כאן, ורק כאן, ידוע מהו טיפוס המודל
          model={presentation.scene as SceneModel}
          materials={presentation.materials}
          lighting={presentation.lighting}
          quality={QUALITY_SETTINGS[state.effectiveQuality]}
          environment={state.environment}
          timeOfDay={state.timeOfDay}
          cameraMode={state.cameraMode}
          focusedRoomId={state.focusedRoomId}
          tourRoomIds={state.tourPath}
          selectedCategory={selectedCategory ?? null}
          onSelect={onSelectCategory}
          showRoomLabels={showLabels && !isTouring}
        />
      ) : presentation?.kind === "REMOTE_STREAM" ? (
        // מנוע מרוחק מזרים וידאו. הנגן עצמו ייכנס יחד עם המימוש שלו.
        <ViewerNotice>{state.message ?? "מתחבר לשרת ההדמיה..."}</ViewerNotice>
      ) : state.status === "LOADING" || state.status === "IDLE" ? (
        <PreparingApartment />
      ) : (
        <ViewerNotice>
          {state.message ?? "לא ניתן להציג את הדירה כרגע."}
          {state.status === "UNSUPPORTED" ? (
            <span className="mt-2 block">
              אפשר לצפות בתוכנית הדירה הדו-ממדית, שמציגה את אותו מידע.
            </span>
          ) : null}
        </ViewerNotice>
      )}

      {isReady ? (
        <>
          {/* שעה ביום */}
          <div
            className={cn("absolute top-3 start-3 flex items-center gap-0.5 p-0.5", PANEL)}
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
                    CHIP,
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

          {/* מצלמה, סיור ומסך מלא */}
          <div className="absolute top-3 end-3 flex items-center gap-2">
            {capabilities?.walkthrough ? (
              <div className={cn("flex items-center gap-0.5 p-0.5", PANEL)}>
                <button
                  type="button"
                  onClick={() => stopWalkthrough()}
                  aria-pressed={state.cameraMode === "ORBIT"}
                  className={cn(
                    CHIP,
                    state.cameraMode === "ORBIT"
                      ? "bg-surface-sunken text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  <Compass className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">סיבוב</span>
                </button>
                <button
                  type="button"
                  onClick={() => startWalkthrough()}
                  aria-pressed={state.cameraMode === "WALK" && !isTouring}
                  className={cn(
                    CHIP,
                    state.cameraMode === "WALK" && !isTouring
                      ? "bg-surface-sunken text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  <Eye className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">סיור</span>
                </button>
              </div>
            ) : null}

            {capabilities?.guidedTour && state.suggestedTour.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  isTouring
                    ? stopWalkthrough()
                    : startWalkthrough({ path: state.suggestedTour, loop: true })
                }
                className={cn(
                  CHIP,
                  PANEL,
                  isTouring ? "text-brand-700" : "text-ink-muted hover:text-ink",
                )}
              >
                {isTouring ? (
                  <StopCircle className="size-3.5" aria-hidden />
                ) : (
                  <PlayCircle className="size-3.5" aria-hidden />
                )}
                <span className="hidden sm:inline">
                  {isTouring ? "עצור סיור" : "סיור אוטומטי"}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
              className={cn(CHIP, PANEL, "text-ink-muted hover:text-ink")}
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5" aria-hidden />
              ) : (
                <Maximize2 className="size-3.5" aria-hidden />
              )}
            </button>
          </div>

          {/* ניווט בין חדרים */}
          {capabilities?.roomNavigation && state.rooms.length > 1 && !isTouring ? (
            <div
              className="absolute inset-x-3 bottom-14 flex justify-center"
              role="group"
              aria-label="מעבר בין חדרים"
            >
              <div className={cn("flex max-w-full gap-1 overflow-x-auto p-1", PANEL)}>
                <button
                  type="button"
                  onClick={() => focusRoom(null)}
                  aria-pressed={state.focusedRoomId === null}
                  className={cn(
                    CHIP,
                    "shrink-0",
                    state.focusedRoomId === null
                      ? "bg-surface-sunken text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  כל הדירה
                </button>
                {state.rooms
                  .filter((room) => room.label)
                  .map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => focusRoom(room.id)}
                      aria-pressed={state.focusedRoomId === room.id}
                      className={cn(
                        CHIP,
                        "shrink-0",
                        state.focusedRoomId === room.id
                          ? "bg-surface-sunken text-ink"
                          : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {room.label}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          {/* תצוגה ואיכות */}
          <div className="absolute bottom-3 start-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLabels((value) => !value)}
              aria-pressed={showLabels}
              className={cn(CHIP, PANEL, "text-ink-muted hover:text-ink")}
            >
              {showLabels ? "הסתר שמות חדרים" : "הצג שמות חדרים"}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings((value) => !value)}
                aria-expanded={showSettings}
                aria-label="איכות תצוגה"
                className={cn(CHIP, PANEL, "text-ink-muted hover:text-ink")}
              >
                <Settings2 className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{QUALITY_LABELS[state.effectiveQuality]}</span>
              </button>

              {showSettings ? (
                <div className={cn("absolute bottom-full start-0 mb-1.5 w-40 p-1", PANEL)}>
                  <p className="px-2 py-1 text-[11px] text-ink-subtle">איכות תצוגה</p>
                  {QUALITY_ORDER.map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      onClick={() => {
                        setQualityMode(quality);
                        setShowSettings(false);
                      }}
                      aria-pressed={state.effectiveQuality === quality}
                      className={cn(
                        CHIP,
                        "w-full justify-between",
                        state.effectiveQuality === quality
                          ? "bg-surface-sunken text-ink"
                          : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {QUALITY_LABELS[quality]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <p className="absolute bottom-3 end-3 max-w-56 rounded-control bg-surface/88 px-2.5 py-1.5 text-[11px] leading-4 text-ink-muted shadow-subtle backdrop-blur-sm">
            {state.cameraMode === "WALK" && !isTouring
              ? "גררו כדי להסתכל מסביב, והשתמשו במקשי החיצים כדי להתקדם."
              : `התצוגה ממחישה את מפרט הדירה. הריהוט להמחשה בלבד ואינו כלול${
                  environment ? ", והנוף מסביב אופייני ואינו הנוף המדויק" : ""
                }. הגימור הסופי נקבע במפרט הטכני ובתוכניות המאושרות.`}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function Apartment3DSkeleton() {
  return <Skeleton className="h-[min(62vh,560px)] w-full rounded-card" />;
}
