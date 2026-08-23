"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { BillingStatus, PlanCatalog } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const atLimit = used >= max;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>{label}</span>
        <span className="tabular">{used} / {max}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: atLimit ? "var(--status-critical)" : "var(--accent)" }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.billingStatus(), api.planCatalog()])
      .then(([s, c]) => {
        setStatus(s);
        setCatalog(c);
        setError(null);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load);

  useEffect(() => {
    if (status !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [status, error]);

  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plan & Usage"
        description="This beta is free during the pilot. No payment is collected or processed anywhere on this platform."
      />

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : status === null || catalog === null ? (
        loadingTooLong ? (
          <div className="card flex flex-col gap-2 p-5 text-sm">
            <p className="font-semibold">Still waiting on your plan details.</p>
            <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
              Retry
            </button>
          </div>
        ) : (
          <CardSkeleton lines={5} />
        )
      ) : (
        <>
          <div className="card animate-in flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Current plan
                </p>
                <p className="text-lg font-semibold capitalize">{status.plan}</p>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {status.plan}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UsageBar label="Watchlist items" used={status.usage.watchlist_items} max={status.usage.max_watchlist_items} />
              <UsageBar label="Alert rules" used={status.usage.alert_rules} max={status.usage.max_alert_rules} />
            </div>
          </div>

          <div className="card animate-in p-5 text-sm" style={{ color: "var(--text-secondary)" }}>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {status.billing_configured ? "Upgrade" : "Billing is not yet available"}
            </p>
            <p className="mt-1.5 leading-relaxed">{status.billing_message}</p>
          </div>

          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Plans
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(catalog.plans).map(([name, limits]) => (
                <div
                  key={name}
                  className="card animate-in flex flex-col gap-2 p-5"
                  style={name === status.plan ? { borderColor: "var(--accent)" } : undefined}
                >
                  <p className="text-sm font-semibold capitalize">{name}</p>
                  <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <li>{limits.max_watchlist_items} watchlist items</li>
                    <li>{limits.max_alert_rules} alert rules</li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
