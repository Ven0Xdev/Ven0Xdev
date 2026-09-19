import { ArrowLeft, Check, CircleDot } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { STAGE_STATE_LABELS, type JourneyResult } from "@/lib/tenant/journey";
import { cn } from "@/lib/utils";

/** פס ההתקדמות ומצב השלב הנוכחי */
export function JourneyProgress({ journey }: { journey: JourneyResult }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-ink">{journey.currentLabel}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">{journey.stepText}</p>
        </div>
        <p className="font-numeric text-[20px] leading-7 font-semibold text-brand-700">
          {journey.percent}%
        </p>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-sunken"
        role="progressbar"
        aria-valuenow={journey.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="התקדמות התהליך"
      >
        <div
          className="h-full rounded-pill bg-brand-600 transition-[width] duration-500"
          style={{ width: `${journey.percent}%` }}
        />
      </div>
    </div>
  );
}

/** ציר הזמן המלא — שמונה השלבים */
export function JourneyTimeline({ journey }: { journey: JourneyResult }) {
  return (
    <ol className="space-y-0">
      {journey.stages.map((stage, index) => (
        <li key={stage.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                stage.state === "DONE" && "border-success-600 bg-success-600 text-white",
                stage.state === "IN_PROGRESS" && "border-brand-600 bg-brand-50 text-brand-700",
                stage.state === "PENDING" && "border-line-strong bg-surface text-ink-subtle",
              )}
            >
              {stage.state === "DONE" ? (
                <Check className="size-3.5" aria-hidden />
              ) : stage.state === "IN_PROGRESS" ? (
                <CircleDot className="size-3.5" aria-hidden />
              ) : (
                <span className="font-numeric text-[10px]">{index + 1}</span>
              )}
            </span>
            {index < journey.stages.length - 1 ? (
              <span
                className={cn(
                  "w-0.5 flex-1",
                  stage.state === "DONE" ? "bg-success-400" : "bg-line",
                )}
                style={{ minHeight: 22 }}
                aria-hidden
              />
            ) : null}
          </div>

          <div className={cn("pb-4", index === journey.stages.length - 1 && "pb-0")}>
            <p
              className={cn(
                "text-[13px] font-medium",
                stage.state === "PENDING" ? "text-ink-subtle" : "text-ink",
              )}
            >
              {stage.label}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {STAGE_STATE_LABELS[stage.state]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** מה צריך ממך עכשיו */
export function NextActionCard({ journey }: { journey: JourneyResult }) {
  const { nextAction } = journey;

  return (
    <Card
      className={cn(
        nextAction.isTenantTurn ? "border-brand-200 bg-brand-50/60" : "bg-surface",
      )}
    >
      <CardContent className="pt-5">
        <p className="text-[12px] font-medium text-ink-muted">מה צריך ממך עכשיו</p>
        <p
          className={cn(
            "mt-1.5 text-[16px] leading-6 font-semibold",
            nextAction.isTenantTurn ? "text-brand-800" : "text-ink",
          )}
        >
          {nextAction.title}
        </p>
        <p className="mt-1.5 text-[13px] leading-6 text-ink-muted">{nextAction.description}</p>

        {nextAction.href && nextAction.linkLabel ? (
          <Link
            href={nextAction.href}
            className="mt-4 inline-flex items-center gap-1.5 rounded-control bg-brand-600 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
          >
            {nextAction.linkLabel}
            <ArrowLeft className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
