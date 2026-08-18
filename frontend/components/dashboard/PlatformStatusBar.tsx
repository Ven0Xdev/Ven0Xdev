"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AutonomousTradingStatus, SafeModeStatus } from "@/lib/types";

/** Compact, always-visible platform status strip — Safe Mode and the
 * autonomous-trading emergency stop, kept live via the caller's
 * `refreshSignal` (bumped by the dashboard's own SSE subscription to
 * GET /stream/dashboard on platform.safe_mode_changed /
 * platform.autonomous_trading_paused_changed). Read-only for everyone;
 * inline Pause/Resume/Emergency-Stop controls appear only for operators
 * (server-enforced regardless of what this hides client-side — the
 * same discipline as AdminGate in app/admin/page.tsx). The full,
 * more-explanatory controls (force on/off, clear override) still live
 * on Admin — this is the fast, at-a-glance dashboard surface. */
export function PlatformStatusBar({ refreshSignal }: { refreshSignal: number }) {
  const [safeMode, setSafeMode] = useState<SafeModeStatus | null>(null);
  const [autonomous, setAutonomous] = useState<AutonomousTradingStatus | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.safeMode().then(setSafeMode).catch(() => setSafeMode(null));
    api.autonomousTradingStatus().then(setAutonomous).catch(() => setAutonomous(null));
  };

  useEffect(() => {
    api.me().then((u) => setIsOperator(u.role === "operator")).catch(() => setIsOperator(false));
  }, []);

  useEffect(load, [refreshSignal]);

  if (safeMode === null && autonomous === null) return null;

  const toggleSafeMode = async () => {
    setBusy(true);
    try {
      await api.setSafeMode(!safeMode?.effective);
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggleAutonomousPause = async () => {
    setBusy(true);
    try {
      await api.setAutonomousTradingPaused(!autonomous?.paused);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5 text-xs"
      style={{ background: "var(--surface-2)" }}
    >
      {safeMode && (
        <span
          className="inline-flex items-center gap-1.5 font-semibold"
          style={{ color: safeMode.effective ? "var(--status-critical)" : "var(--status-good)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: safeMode.effective ? "var(--status-critical)" : "var(--status-good)" }}
          />
          Safe Mode {safeMode.effective ? "ACTIVE" : "off"}
        </span>
      )}
      {autonomous && (
        <span
          className="inline-flex items-center gap-1.5 font-semibold"
          style={{ color: autonomous.paused ? "var(--status-critical)" : "var(--status-good)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: autonomous.paused ? "var(--status-critical)" : "var(--status-good)" }}
          />
          Autonomous trading {autonomous.paused ? "PAUSED" : "running"}
        </span>
      )}
      {isOperator && safeMode && autonomous && (
        <div className="ml-auto flex gap-1.5">
          <button disabled={busy} onClick={toggleSafeMode} className="btn btn-ghost btn-sm">
            {safeMode.effective ? "Deactivate Safe Mode" : "Activate Safe Mode"}
          </button>
          <button disabled={busy} onClick={toggleAutonomousPause} className="btn btn-ghost btn-sm">
            {autonomous.paused ? "Resume autonomous trading" : "Emergency stop"}
          </button>
        </div>
      )}
    </div>
  );
}
