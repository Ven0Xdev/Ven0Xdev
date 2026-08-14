"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type {
  ModelVersionOut,
  PlatformHealthReport,
  ProviderHealth,
  SafeModeStatus,
  SchemaStatus,
  UniverseAsset,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

type Role = "operator" | "user" | "checking" | "anonymous";

function useOperatorGate() {
  const [role, setRole] = useState<Role>("checking");

  useEffect(() => {
    api
      .me()
      .then((u) => setRole(u.role === "operator" ? "operator" : "user"))
      .catch(() => setRole("anonymous"));
  }, []);

  return role;
}

export default function AdminPage() {
  const role = useOperatorGate();

  if (role === "checking") {
    return <CardSkeleton lines={6} />;
  }
  if (role !== "operator") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Admin" description="Operator access required." />
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {role === "anonymous"
              ? "Sign in with an operator account to view this page."
              : "Your account does not have operator access. This page is restricted to platform operators — the same server-side check that gates model promotion, on-demand scans, and asset universe writes."}
          </p>
        </div>
      </div>
    );
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const [safeMode, setSafeMode] = useState<SafeModeStatus | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null);
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthReport | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus | null>(null);
  const [models, setModels] = useState<ModelVersionOut[] | null>(null);
  const [assets, setAssets] = useState<UniverseAsset[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.safeMode(),
      api.providerHealth(),
      api.platformHealth(),
      api.schemaStatus(),
      api.models(),
      api.assetUniverse(),
    ])
      .then(([sm, ph, plh, ss, m, a]) => {
        setSafeMode(sm);
        setProviderHealth(ph);
        setPlatformHealth(plh);
        setSchemaStatus(ss);
        setModels(m);
        setAssets(a);
        setError(null);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load);

  useEffect(() => {
    if (safeMode !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [safeMode, error]);

  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (safeMode === null || providerHealth === null || platformHealth === null || schemaStatus === null || models === null || assets === null) {
    return loadingTooLong ? (
      <div className="card flex flex-col gap-2 p-5 text-sm">
        <p className="font-semibold">Still waiting on the admin dashboard.</p>
        <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
          Retry
        </button>
      </div>
    ) : (
      <CardSkeleton lines={8} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin"
        description="Operator-only platform controls: Safe Mode, provider and schema health, the model registry, and the asset universe. Server-enforced — every write below goes through the same operator check as the API endpoints it calls."
      />

      <SafeModeCard status={safeMode} onChange={load} />

      <div className="animate-in-stagger grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ProviderHealthCard health={providerHealth} />
        <SchemaStatusCard status={schemaStatus} />
        <DatabaseHealthCard report={platformHealth} />
      </div>

      <AlertsCard report={platformHealth} />

      <ModelRegistryCard models={models} onChange={load} />

      <AssetUniverseCard assets={assets} onChange={load} />
    </div>
  );
}

function SafeModeCard({ status, onChange }: { status: SafeModeStatus; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const apply = async (override: boolean | null) => {
    setBusy(true);
    setActionError(null);
    try {
      await api.setSafeMode(override);
      onChange();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="card animate-in flex flex-col gap-3 p-5"
      style={status.effective ? { borderColor: "var(--status-critical-soft)" } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Safe Mode — platform-wide kill switch</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            When active, the risk engine rejects every new signal and trade regardless of how strong the setup looks.
            Env default: <strong>{status.env_default ? "ON" : "OFF"}</strong>
            {status.override !== null && (
              <> · Operator override: <strong>{status.override ? "ON" : "OFF"}</strong></>
            )}
            {status.updated_at && (
              <> · last changed {new Date(status.updated_at).toISOString().slice(0, 16).replace("T", " ")} UTC</>
            )}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            background: status.effective ? "var(--status-critical-soft)" : "var(--status-good-soft)",
            color: status.effective ? "var(--status-critical)" : "var(--status-good)",
          }}
        >
          {status.effective ? "ACTIVE" : "Inactive"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => apply(true)} className="btn btn-secondary btn-sm">
          Force ON
        </button>
        <button disabled={busy} onClick={() => apply(false)} className="btn btn-secondary btn-sm">
          Force OFF
        </button>
        <button disabled={busy || status.override === null} onClick={() => apply(null)} className="btn btn-ghost btn-sm">
          Clear override (follow env default)
        </button>
      </div>
      {actionError !== null && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {actionError instanceof Error ? actionError.message : String(actionError)}
        </p>
      )}
    </div>
  );
}

function ProviderHealthCard({ health }: { health: ProviderHealth }) {
  return (
    <div className="card animate-in flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold">Market data provider</h2>
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: health.ok ? "var(--status-good)" : "var(--status-critical)" }}
          aria-hidden="true"
        />
        {health.ok ? "Reachable" : "Unreachable"}
      </div>
      <dl className="mt-1 flex flex-col gap-1 text-xs">
        <Row label="Provider" value={health.provider} />
        <Row label="Data mode" value={health.data_mode} />
        <Row label="Latency" value={`${health.latency_ms} ms`} />
        {health.error && <Row label="Error" value={health.error} />}
      </dl>
    </div>
  );
}

function SchemaStatusCard({ status }: { status: SchemaStatus }) {
  return (
    <div className="card animate-in flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold">Database schema</h2>
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: status.ready ? "var(--status-good)" : "var(--status-critical)" }}
          aria-hidden="true"
        />
        {status.ready ? "Up to date" : "Behind expected migration head"}
      </div>
      <dl className="mt-1 flex flex-col gap-1 text-xs">
        <Row label="Managed by" value={status.schema_managed_by} />
        {status.applied_revision && <Row label="Applied" value={status.applied_revision} />}
        {status.expected_revision && <Row label="Expected" value={status.expected_revision} />}
      </dl>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{status.detail}</p>
    </div>
  );
}

function DatabaseHealthCard({ report }: { report: PlatformHealthReport }) {
  const healthy = report.database.status === "healthy";
  return (
    <div className="card animate-in flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold">Database</h2>
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: healthy ? "var(--status-good)" : "var(--status-critical)" }}
          aria-hidden="true"
        />
        {healthy ? "Healthy" : "Unreachable"}
      </div>
      <dl className="mt-1 flex flex-col gap-1 text-xs">
        {report.database.ping_ms !== undefined && <Row label="Ping" value={`${report.database.ping_ms} ms`} />}
        {report.database.error && <Row label="Error" value={report.database.error} />}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular text-right" style={{ color: "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

function AlertsCard({ report }: { report: PlatformHealthReport }) {
  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Platform alerts
      </h2>
      {report.alerts.length === 0 ? (
        <div className="card animate-in p-6 text-sm" style={{ color: "var(--text-muted)" }}>
          No active alerts — drift, calibration, provider failures, scanner freshness, and API latency are all within
          their configured thresholds.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {report.alerts.map((a, i) => (
            <div
              key={i}
              className="card animate-in flex items-start gap-3 p-3.5 text-sm"
              style={{ borderColor: a.severity === "critical" ? "var(--status-critical-soft)" : "var(--status-warning-soft)" }}
            >
              <span
                className="mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase"
                style={{
                  background: a.severity === "critical" ? "var(--status-critical-soft)" : "var(--status-warning-soft)",
                  color: a.severity === "critical" ? "var(--status-critical)" : "var(--status-warning)",
                }}
              >
                {a.severity}
              </span>
              <div>
                <p className="font-medium">{a.code}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{a.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelRegistryCard({ models, onChange }: { models: ModelVersionOut[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const train = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api.trainChallenger();
      onChange();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  const promote = async (versionId: number) => {
    setBusy(true);
    setActionError(null);
    try {
      await api.promoteModel(versionId);
      onChange();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Model registry
        </h2>
        <button disabled={busy} onClick={train} className="btn btn-secondary btn-sm">
          {busy ? "Working…" : "Train challenger"}
        </button>
      </div>
      {actionError !== null && (
        <p className="mb-2 text-xs" style={{ color: "var(--status-critical)" }}>
          {actionError instanceof Error ? actionError.message : String(actionError)}
        </p>
      )}
      {models.length === 0 ? (
        <div className="card animate-in p-6 text-sm" style={{ color: "var(--text-muted)" }}>
          No models registered yet — every prediction served today comes from the deterministic HEURISTIC engine.
        </div>
      ) : (
        <div className="card animate-in overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Trained</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-semibold">{m.version}</td>
                  <td className="px-4 py-3">{m.model_type}</td>
                  <td className="px-4 py-3 tabular" style={{ color: "var(--text-muted)" }}>
                    {new Date(m.trained_at).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3">
                    {m.is_active ? (
                      <span className="text-xs font-semibold" style={{ color: "var(--status-good)" }}>Champion</span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Challenger</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!m.is_active && (
                      <button disabled={busy} onClick={() => promote(m.id)} className="btn btn-ghost btn-sm">
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssetUniverseCard({ assets, onChange }: { assets: UniverseAsset[]; onChange: () => void }) {
  const [form, setForm] = useState({ symbol: "", asset_type: "STOCK", name: "", exchange: "NASDAQ" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const add = async () => {
    if (!form.symbol.trim() || !form.name.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.addUniverseAsset({ ...form, symbol: form.symbol.trim().toUpperCase() });
      setForm({ symbol: "", asset_type: "STOCK", name: "", exchange: "NASDAQ" });
      onChange();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (asset: UniverseAsset) => {
    setBusy(true);
    setActionError(null);
    try {
      await api.setUniverseAssetActive(asset.symbol, !asset.is_active);
      onChange();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Asset universe
      </h2>
      <form
        className="card animate-in mb-3 flex flex-wrap items-end gap-2.5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Symbol
          <input
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            placeholder="e.g. MSFT"
            className="input w-28"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Type
          <select
            value={form.asset_type}
            onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
            className="input w-32"
          >
            <option value="STOCK">Stock</option>
            <option value="ETF">ETF</option>
            <option value="INDEX">Index</option>
            <option value="COMMODITY">Commodity</option>
            <option value="PRECIOUS_METAL">Precious metal</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Company/asset name"
            className="input w-48"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Exchange
          <input
            value={form.exchange}
            onChange={(e) => setForm({ ...form, exchange: e.target.value })}
            className="input w-28"
          />
        </label>
        <button type="submit" disabled={busy} className="btn btn-primary">
          Add asset
        </button>
      </form>
      {actionError !== null && (
        <p className="mb-2 text-xs" style={{ color: "var(--status-critical)" }}>
          {actionError instanceof Error ? actionError.message : String(actionError)}
        </p>
      )}
      <div className="card animate-in overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Exchange</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-4 py-3 font-semibold">{a.symbol}</td>
                <td className="px-4 py-3">{a.asset_type}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{a.exchange}</td>
                <td className="px-4 py-3">
                  <button disabled={busy} onClick={() => toggle(a)} className="btn btn-ghost btn-sm">
                    {a.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
