"""Model drift detection — Population Stability Index (PSI) over an
IMMUTABLE, cohort-isolated baseline.

Model drift:   distribution of the model's own outputs (prob_up_10, overall
               score, confidence, manipulation_risk) — a frozen baseline vs.
               the current cohort's most recent predictions. If the model
               suddenly hands out different probabilities for the same kind
               of market, something changed: the data, the regime, or a bug.
Feature drift: same comparison per input feature from the frozen
               feature_snapshots — identifies WHICH inputs moved.

PSI conventions (industry-standard bands):
  < 0.10  stable · 0.10–0.25 moderate shift · > 0.25 significant drift

Cohort isolation (added after a live incident — see git history around
2026-08-19): comparing "the most recent 200 predictions" against "the 200
before that" is only a valid drift measurement if both windows are drawn
from a genuinely comparable population. Predictions logged under a
different model version, feature schema, risk policy, configured
provider, or data freshness (live vs. delayed) are not comparable to
today's — mixing them in doesn't measure drift, it measures the fact that
the deployment changed. Every read here filters to the ACTIVE cohort
only: the exact (engine_mode, model_version, risk_policy_version,
feature_schema_version, provider_class, data_mode) tuple of the most
recent prediction. Rows outside that cohort are never deleted — they stay
in the table for audit (see cohort_breakdown() below) — just excluded
from the active score.

Baseline (services/db/models/drift_baseline.py): a FROZEN reference
distribution, established once per cohort from that cohort's own matured
(Outcome-joined — i.e. genuinely realized, not provisional) predictions,
and never silently recomputed. A sliding "reference window" that shifts
every time you call this isn't a real baseline — you're never actually
comparing against a fixed point of trust, just two arbitrary recent
slices against each other. If a cohort has no baseline yet (not enough
matured, closed live-data outcomes), or the current cohort's own sample
is too thin, this reports "insufficient_history" — the platform's honest
LEARNING state — rather than fabricating a score from too little or
incomparable data. Never hides genuine drift either: once a clean,
compatible cohort has enough matured data to establish a baseline, a real
divergence from it still reports "significant."
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
from sqlalchemy.orm import Session

from app.db.models.drift_baseline import DriftBaseline
from app.db.models.prediction import Outcome, Prediction
from app.services.ml.feature_vector import FEATURE_NAMES

PSI_MODERATE = 0.10
PSI_SIGNIFICANT = 0.25
MIN_VALID_SAMPLE = 30  # both the baseline and the recent window need at least this many cohort-matched rows

MODEL_ATTRS = ("prob_up_10", "overall_ai_score", "confidence_score", "manipulation_risk")

# Cohort dimensions, in the order the unique index on drift_baselines uses.
# Deliberately NOT keyed on `data_source` (the per-call self-reported
# vendor, which flips on routine fallback — see Prediction's own field
# comments) or on a "timeframe"/"horizon" column, because this scorer
# (services/scoring/scorer.py's StockAnalysis) has neither: every
# prediction always carries all three horizons (prob_up_5/10/20) at once,
# and is not evaluated per-timeframe the way services/signals/ncs.py's
# NcsSignal rows are.
COHORT_ATTRS = (
    "engine_mode", "model_version", "risk_policy_version",
    "feature_schema_version", "provider_class", "data_mode",
)


def population_stability_index(reference: np.ndarray, recent: np.ndarray, n_buckets: int = 10) -> float:
    """Standard PSI with reference-quantile buckets and epsilon smoothing."""
    reference = np.asarray(reference, dtype=float)
    recent = np.asarray(recent, dtype=float)
    if len(reference) == 0 or len(recent) == 0:
        return 0.0

    edges = np.unique(np.quantile(reference, np.linspace(0, 1, n_buckets + 1)))
    if len(edges) < 3:  # (near-)constant reference — PSI undefined, report stable
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf

    ref_frac = np.histogram(reference, bins=edges)[0] / len(reference)
    rec_frac = np.histogram(recent, bins=edges)[0] / len(recent)
    eps = 1e-4
    ref_frac = np.clip(ref_frac, eps, None)
    rec_frac = np.clip(rec_frac, eps, None)
    return float(np.sum((rec_frac - ref_frac) * np.log(rec_frac / ref_frac)))


def _band(psi: float) -> str:
    return "significant" if psi > PSI_SIGNIFICANT else "moderate" if psi > PSI_MODERATE else "stable"


# `model_version` is legitimately None whenever engine_mode is HEURISTIC
# (no trained model artifact exists — see champion_challenger.py) and is
# still a real, valid cohort value in that case, never a sign of missing
# provenance. Only these three are new fields that predate this whole
# migration and MUST be present for a row to have known, modern
# provenance at all.
_REQUIRED_PROVENANCE_ATTRS = ("feature_schema_version", "provider_class", "data_mode")


def active_cohort_key(db: Session) -> tuple[str, ...] | None:
    """The exact cohort of the single most recent prediction — "active"
    means "whatever the deployment is producing right now." Returns None
    if there are no predictions yet, or the most recent one predates
    cohort-provenance tracking (any of `_REQUIRED_PROVENANCE_ATTRS` is
    NULL) — both are honest "insufficient_history" states, never a
    guessed cohort."""
    latest = db.query(Prediction).order_by(Prediction.created_at.desc()).first()
    if latest is None:
        return None
    if any(getattr(latest, attr) is None for attr in _REQUIRED_PROVENANCE_ATTRS):
        return None
    return tuple(getattr(latest, attr) for attr in COHORT_ATTRS)


def _cohort_query(db: Session, key: tuple[str, ...]):
    query = db.query(Prediction)
    for attr, value in zip(COHORT_ATTRS, key, strict=True):
        query = query.filter(getattr(Prediction, attr) == value)
    return query


def _baseline_filter_kwargs(key: tuple[str, ...]) -> dict[str, str]:
    return dict(zip(COHORT_ATTRS, key, strict=True))


def _get_baseline(db: Session, key: tuple[str, ...]) -> DriftBaseline | None:
    return db.query(DriftBaseline).filter_by(**_baseline_filter_kwargs(key)).one_or_none()


def _collect_values(rows: list[Prediction]) -> dict[str, list[float]]:
    values: dict[str, list[float]] = {attr: [getattr(r, attr) for r in rows] for attr in MODEL_ATTRS}
    for name in FEATURE_NAMES:
        vals = [r.feature_snapshot[name] for r in rows if name in r.feature_snapshot]
        if vals:
            values[name] = vals
    return values


def _build_baseline(db: Session, key: tuple[str, ...]) -> DriftBaseline | None:
    """Establishes a cohort's baseline from its own matured predictions
    only (an INNER JOIN to Outcome — a prediction with no graded outcome
    yet is provisional, not "closed live-data" evidence). Returns None,
    changing nothing, if there aren't enough yet."""
    matured = (
        _cohort_query(db, key)
        .join(Outcome, Outcome.prediction_id == Prediction.id)
        .order_by(Prediction.created_at.desc())
        .limit(500)
        .all()
    )
    if len(matured) < MIN_VALID_SAMPLE:
        return None

    baseline = DriftBaseline(
        **_baseline_filter_kwargs(key),
        established_at=datetime.now(timezone.utc),
        sample_size=len(matured),
        values=_collect_values(matured),
    )
    db.add(baseline)
    try:
        db.commit()
    except Exception:
        # Lost a race establishing the same cohort's baseline concurrently
        # — the unique index is the authoritative guard; whichever commit
        # won, re-read it rather than erroring the caller.
        db.rollback()
        return _get_baseline(db, key)
    db.refresh(baseline)
    return baseline


def rebuild_baseline(db: Session, key: tuple[str, ...]) -> DriftBaseline | None:
    """Explicit, operator-triggered rebuild (POST /admin/drift/rebaseline)
    — deletes any existing baseline for this exact cohort and re-
    establishes it from whatever matured data exists right now. Still
    returns None (baseline cleared, not replaced) if that's not enough."""
    db.query(DriftBaseline).filter_by(**_baseline_filter_kwargs(key)).delete()
    db.commit()
    return _build_baseline(db, key)


def cohort_breakdown(db: Session, limit: int = 500) -> list[dict]:
    """Audit report (item 1 of the drift-incident review): every distinct
    combination of cohort dimensions plus ticker/day actually present in
    predictions, with row counts — so "was the CRITICAL reading caused by
    mixed cohorts" has a concrete, inspectable answer instead of a guess.
    Reads every row in `limit` most-recent predictions; never mutates
    anything."""
    from collections import Counter

    rows = db.query(Prediction).order_by(Prediction.created_at.desc()).limit(limit).all()
    counts: Counter[tuple] = Counter()
    for r in rows:
        key = (
            r.engine_mode, r.model_version, r.risk_policy_version, r.feature_schema_version,
            r.provider_class, r.data_source, r.data_mode, r.ticker_symbol, r.created_at.date().isoformat(),
        )
        counts[key] += 1
    fields = (
        "engine_mode", "model_version", "risk_policy_version", "feature_schema_version",
        "provider_class", "data_source", "data_mode", "ticker_symbol", "date",
    )
    return [
        {**dict(zip(fields, key, strict=True)), "count": n}
        for key, n in sorted(counts.items(), key=lambda kv: -kv[1])
    ]


def drift_report(db: Session, window: int = 200) -> dict:
    """Cohort-isolated, baseline-anchored PSI report for the ACTIVE
    cohort only. "recent" = the cohort's own most recent `window`
    predictions (provisional is fine — the whole point is catching drift
    before waiting weeks for outcomes to mature); "reference" = the
    cohort's frozen DriftBaseline, built once from matured outcomes only.
    """
    key = active_cohort_key(db)
    if key is None:
        return {
            "status": "insufficient_history",
            "note": "No predictions yet, or the most recent one predates cohort-provenance tracking.",
        }

    baseline = _get_baseline(db, key) or _build_baseline(db, key)
    cohort_info = dict(zip(COHORT_ATTRS, key, strict=True))
    if baseline is None:
        matured_count = (
            _cohort_query(db, key).join(Outcome, Outcome.prediction_id == Prediction.id).count()
        )
        return {
            "status": "insufficient_history",
            "cohort": cohort_info,
            "note": (
                f"Active cohort has only {matured_count}/{MIN_VALID_SAMPLE} matured (closed, outcome-graded) "
                f"predictions — not enough to establish a baseline yet. LEARNING, not CRITICAL."
            ),
        }

    recent_rows = _cohort_query(db, key).order_by(Prediction.created_at.desc()).limit(window).all()
    if len(recent_rows) < MIN_VALID_SAMPLE:
        return {
            "status": "insufficient_history",
            "cohort": cohort_info,
            "note": f"Active cohort has only {len(recent_rows)}/{MIN_VALID_SAMPLE} recent predictions.",
        }

    model_drift: dict[str, dict] = {}
    for attr in MODEL_ATTRS:
        psi = population_stability_index(
            np.array(baseline.values.get(attr, [])), np.array([getattr(r, attr) for r in recent_rows]),
        )
        model_drift[attr] = {"psi": round(psi, 4), "band": _band(psi)}

    feature_drift: dict[str, dict] = {}
    for name in FEATURE_NAMES:
        ref_vals = baseline.values.get(name, [])
        rec_vals = [r.feature_snapshot[name] for r in recent_rows if name in r.feature_snapshot]
        if len(ref_vals) < MIN_VALID_SAMPLE or len(rec_vals) < MIN_VALID_SAMPLE:
            continue
        psi = population_stability_index(np.array(ref_vals), np.array(rec_vals))
        feature_drift[name] = {"psi": round(psi, 4), "band": _band(psi)}
    feature_drift = dict(sorted(feature_drift.items(), key=lambda kv: -kv[1]["psi"])[:10])

    worst_model = max((v["psi"] for v in model_drift.values()), default=0.0)
    worst_feature = max((v["psi"] for v in feature_drift.values()), default=0.0)

    return {
        "status": "ok",
        "cohort": cohort_info,
        "baseline_established_at": baseline.established_at.isoformat(),
        "baseline_sample_size": baseline.sample_size,
        "recent_window": len(recent_rows),
        "model_drift": model_drift,
        "top_feature_drift": feature_drift,
        "worst_model_psi": round(worst_model, 4),
        "worst_feature_psi": round(worst_feature, 4),
    }


def drift_status_label(db: Session) -> str:
    """One-word summary of `drift_report()` — "insufficient_history" (the
    platform's LEARNING state — see this module's docstring), or the
    worse of the model/feature PSI bands. For call sites (e.g. the chat
    assistant's per-answer provenance, Red-Team's veto check) that need a
    quick status, not the full report."""
    report = drift_report(db)
    if report["status"] != "ok":
        return "insufficient_history"
    return _band(max(report["worst_model_psi"], report["worst_feature_psi"]))
