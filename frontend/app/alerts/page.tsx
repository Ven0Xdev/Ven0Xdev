"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { AlertComparison, AlertConditionType, AlertEvent, AlertRule } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { LocalTime } from "@/components/ui/LocalTime";

const CONDITION_LABELS: Record<AlertConditionType, string> = {
  price: "Price",
  ai_score: "AI score",
  manipulation_risk: "Manipulation risk",
  signal_status: "Signal status",
};

const SIGNAL_STATUSES = [
  "NO_TRADE", "AVOID", "WATCH", "SETUP_FORMING", "POSSIBLE_ENTRY",
  "POSITION_ACTIVE", "REDUCE", "EXIT", "SIGNAL_INVALIDATED",
];

function describeRule(rule: AlertRule): string {
  if (rule.condition_type === "signal_status") {
    return `Signal status becomes ${rule.target_status}`;
  }
  const label = CONDITION_LABELS[rule.condition_type];
  return `${label} goes ${rule.comparison} ${rule.threshold_value}`;
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [events, setEvents] = useState<AlertEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const [form, setForm] = useState<{
    ticker: string;
    conditionType: AlertConditionType;
    comparison: AlertComparison;
    threshold: string;
    targetStatus: string;
  }>({ ticker: "", conditionType: "price", comparison: "above", threshold: "", targetStatus: "POSSIBLE_ENTRY" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([api.alertRules(), api.alertEvents()])
      .then(([r, e]) => {
        setRules(r);
        setEvents(e);
        setError(null);
      })
      .catch((err) => setError(err));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load);

  useEffect(() => {
    if (rules !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [rules, error]);

  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  const createRule = async () => {
    if (!form.ticker.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.createAlertRule({
        ticker_symbol: form.ticker.trim().toUpperCase(),
        condition_type: form.conditionType,
        comparison: form.conditionType === "signal_status" ? "equals" : form.comparison,
        threshold_value: form.conditionType === "signal_status" ? undefined : Number(form.threshold),
        target_status: form.conditionType === "signal_status" ? form.targetStatus : undefined,
      });
      setForm({ ...form, ticker: "", threshold: "" });
      load();
    } catch (e) {
      setCreateError(e);
    } finally {
      setCreating(false);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    try {
      await api.setAlertRuleActive(rule.id, !rule.is_active);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const removeRule = async (ruleId: number) => {
    try {
      await api.deleteAlertRule(ruleId);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const acknowledge = async (eventId: number) => {
    try {
      await api.acknowledgeAlertEvent(eventId);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        description="In-app notifications only — no email or push delivery is configured. A rule is checked on the platform's hourly analysis cycle for that ticker, never faster, and never claims a delivery that didn't happen."
      />

      <form
        className="card animate-in flex flex-wrap items-end gap-2.5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          createRule();
        }}
      >
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Ticker
          <input
            value={form.ticker}
            onChange={(e) => setForm({ ...form, ticker: e.target.value })}
            placeholder="e.g. AAPL"
            className="input w-28"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Condition
          <select
            value={form.conditionType}
            onChange={(e) => setForm({ ...form, conditionType: e.target.value as AlertConditionType })}
            className="input w-44"
          >
            {(Object.keys(CONDITION_LABELS) as AlertConditionType[]).map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        {form.conditionType === "signal_status" ? (
          <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Becomes
            <select
              value={form.targetStatus}
              onChange={(e) => setForm({ ...form, targetStatus: e.target.value })}
              className="input w-44"
            >
              {SIGNAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Comparison
              <select
                value={form.comparison}
                onChange={(e) => setForm({ ...form, comparison: e.target.value as AlertComparison })}
                className="input w-28"
              >
                <option value="above">above</option>
                <option value="below">below</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Threshold
              <input
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                type="number"
                step="any"
                className="input w-32"
              />
            </label>
          </>
        )}
        <button type="submit" disabled={creating} className="btn btn-primary">
          {creating ? "Creating…" : "Create alert"}
        </button>
        {createError !== null && (
          <p className="w-full text-xs" style={{ color: "var(--status-critical)" }}>
            {createError instanceof Error ? createError.message : String(createError)}
          </p>
        )}
      </form>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : rules === null ? (
        loadingTooLong ? (
          <div className="card flex flex-col gap-2 p-5 text-sm">
            <p className="font-semibold">Still waiting on your alerts.</p>
            <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
              Retry
            </button>
          </div>
        ) : (
          <CardSkeleton lines={4} />
        )
      ) : (
        <>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Your rules
            </h2>
            {rules.length === 0 ? (
              <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No alert rules yet.</p>
              </div>
            ) : (
              <div className="card animate-in overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-4 py-3">Condition</th>
                      <th className="px-4 py-3">Last fired</th>
                      <th className="px-4 py-3">Active</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                        <td className="px-4 py-3">
                          <Link href={`/stock/${rule.ticker_symbol}`} className="font-semibold hover:underline">
                            {rule.ticker_symbol}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{describeRule(rule)}</td>
                        <td className="px-4 py-3 tabular" style={{ color: "var(--text-muted)" }}>
                          <LocalTime iso={rule.last_fired_at} options={{ style: "short" }} fallback="never" />
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleRule(rule)} className="btn btn-ghost btn-sm">
                            {rule.is_active ? "Enabled" : "Disabled"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => removeRule(rule.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--status-critical)" }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Fired alerts
            </h2>
            {events && events.length === 0 ? (
              <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No alerts have fired yet.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {(events ?? []).map((event) => (
                  <li
                    key={event.id}
                    className="card animate-in flex items-center justify-between gap-3 p-3.5 text-sm"
                    style={{ opacity: event.acknowledged ? 0.6 : 1 }}
                  >
                    <div>
                      <p className="font-medium">{event.message}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        <LocalTime iso={event.fired_at} options={{ style: "short" }} />
                      </p>
                    </div>
                    {!event.acknowledged && (
                      <button onClick={() => acknowledge(event.id)} className="btn btn-secondary btn-sm shrink-0">
                        Dismiss
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
