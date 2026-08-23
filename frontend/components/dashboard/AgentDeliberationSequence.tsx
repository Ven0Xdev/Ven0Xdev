"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion";
import { Badge } from "@/components/ui/Badge";
import type { Deliberation, DeliberationEvidence } from "@/lib/types";

/** Visualizes the real 6-stage deliberation pipeline computed by
 * backend/app/services/agents/reasoning_engine.py (EVIDENCE -> CONFIDENCE
 * -> CONTRADICTION -> RISK -> EXPLANATION -> RECOMMENDATION). This is a
 * genuine multi-agent system today — TechnicalAnalyst, FundamentalAnalyst,
 * SentimentAnalyst, NewsAnalyst, ManipulationDetective, ContrarianAnalyst,
 * RiskManager and JudgeAgent all contribute real, named evidence — but it
 * runs as ordered stages, not the platform's still-unbuilt "5 independent
 * blind agents + CIO judge" committee design. The animation paces the
 * reveal of this ALREADY-COMPUTED real data; it never re-runs analysis,
 * never invents an agent claim, and never shows a stage before its real
 * result has arrived from the API.
 */

const STAGE_META: Record<string, { title: string; hint: string }> = {
  evidence: { title: "Evidence Gathering", hint: "Domain analysts collect directional evidence" },
  confidence: { title: "Confidence Scoring", hint: "How much should this evidence be trusted?" },
  contradiction: { title: "Contrarian Review", hint: "Actively attacking the emerging consensus" },
  risk: { title: "Risk Assessment", hint: "Translating the case into loss terms" },
  explanation: { title: "Explanation", hint: "The strongest case for and against, in plain language" },
  recommendation: { title: "Chief Verdict", hint: "Final synthesis + portfolio sizing discipline" },
};

const STANCE_VARIANT: Record<string, "good" | "warning" | "critical"> = {
  favorable: "good",
  constructive: "good",
  neutral: "warning",
};

function agentDisplayName(agent: string): string {
  // Real agent identifiers are snake_case (e.g. "technical_analyst",
  // "manipulation_detective") — also handles CamelCase defensively in case
  // that ever changes.
  return agent
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function monogram(agent: string): string {
  const words = agentDisplayName(agent).split(" ").filter(Boolean);
  return (words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "");
}

function AgentCard({ ev }: { ev: DeliberationEvidence }) {
  const color =
    ev.direction === "bullish" ? "var(--status-good)" : ev.direction === "bearish" ? "var(--status-critical)" : "var(--text-muted)";
  return (
    <div className="agent-evidence-in flex items-start gap-2.5 rounded-[10px] px-3.5 py-2.5" style={{ background: "var(--surface-2)" }}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        aria-hidden="true"
      >
        {monogram(ev.agent)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          {agentDisplayName(ev.agent)}
          <span style={{ color }}>· {ev.direction}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {ev.claim}
        </p>
      </div>
    </div>
  );
}

function StageCard({
  stage,
  idx,
  isRevealed,
  isActivating,
  verdict,
  stanceVariant,
}: {
  stage: Deliberation["stages"][number];
  idx: number;
  isRevealed: boolean;
  isActivating: boolean;
  verdict: Deliberation["verdict"];
  stanceVariant: "good" | "warning" | "critical";
}) {
  const meta = STAGE_META[stage.stage] ?? { title: stage.stage, hint: "" };
  const grouped = useMemo(() => {
    const byAgent = new Map<string, DeliberationEvidence>();
    for (const e of stage.evidence) {
      // one representative claim per agent per stage keeps the sequence
      // scannable — full text remains in stage.summary.
      if (!byAgent.has(e.agent)) byAgent.set(e.agent, e);
    }
    return Array.from(byAgent.values());
  }, [stage]);

  if (!isRevealed && !isActivating) return null; // not reached yet — no placeholder speculation

  return (
    <li className={isRevealed ? "agent-stage-in card p-4" : "card p-4"}>
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isActivating ? "agent-activating" : ""}`}
          style={{
            background: isRevealed ? "var(--accent-soft)" : "var(--surface-2)",
            color: isRevealed ? "var(--accent)" : "var(--text-muted)",
          }}
          aria-hidden="true"
        >
          {idx + 1}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{meta.title}</div>
          {!isRevealed && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {meta.hint}…
            </div>
          )}
        </div>
      </div>

      {isRevealed && (
        <div className="mt-3 flex flex-col gap-2.5">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {stage.summary}
          </p>
          {grouped.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {grouped.map((ev, i) => (
                <AgentCard key={`${ev.agent}-${i}`} ev={ev} />
              ))}
            </div>
          )}

          {stage.stage === "recommendation" && (
            <div className="agent-stage-in mt-1.5 flex flex-col gap-2 rounded-[10px] p-3.5" style={{ background: "var(--accent-soft)" }}>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                  Chief Agent conclusion
                </span>
                <Badge variant={stanceVariant}>{verdict.stance}</Badge>
                <span className="tabular text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  conviction {(verdict.conviction * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {verdict.narrative}
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function AgentDeliberationSequence({ deliberation }: { deliberation: Deliberation }) {
  const reducedMotion = useReducedMotion();
  const stages = deliberation.stages;
  const [revealed, setRevealed] = useState(reducedMotion ? stages.length : 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-runs only when a genuinely different deliberation loads (ticker
  // change) or the stage count / reduced-motion preference changes — not
  // on every re-render of the parent.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (reducedMotion) {
      Promise.resolve().then(() => setRevealed(stages.length));
      return;
    }
    Promise.resolve().then(() => setRevealed(0));
    let i = 0;
    const step = () => {
      i += 1;
      setRevealed(i);
      if (i < stages.length) {
        timerRef.current = setTimeout(step, 550);
      }
    };
    timerRef.current = setTimeout(step, 450);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [deliberation.ticker, stages.length, reducedMotion]);

  const showAll = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRevealed(stages.length);
  };

  const verdict = deliberation.verdict;
  const stanceVariant = useMemo(() => STANCE_VARIANT[verdict.stance] ?? "critical", [verdict.stance]);

  return (
    <div className="flex flex-col gap-3">
      {revealed < stages.length && (
        <button type="button" onClick={showAll} className="btn btn-ghost btn-sm self-end">
          Skip to result
        </button>
      )}

      <ol className="flex flex-col gap-3">
        {stages.map((stage, idx) => (
          <StageCard
            key={stage.stage}
            stage={stage}
            idx={idx}
            isRevealed={idx < revealed}
            isActivating={idx === revealed}
            verdict={verdict}
            stanceVariant={stanceVariant}
          />
        ))}
      </ol>
    </div>
  );
}
