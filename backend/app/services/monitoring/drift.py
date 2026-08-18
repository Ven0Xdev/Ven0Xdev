"""Drift detection — Population Stability Index (PSI) over stored predictions.

Model drift:   distribution of the model's own outputs (prob_up_10, overall
               score) — recent window vs. reference window. If the model
               suddenly hands out different probabilities for the same kind
               of market, something changed: the data, the regime, or a bug.
Feature drift: same comparison per input feature from the frozen
               feature_snapshots — identifies WHICH inputs moved.

PSI conventions (industry-standard bands):
  < 0.10  stable · 0.10–0.25 moderate shift · > 0.25 significant drift

Both windows come from the predictions table, so drift is computed over
exactly what the model actually saw and said — never re-derived data.
"""
from __future__ import annotations

import numpy as np
from sqlalchemy.orm import Session

from app.db.models.prediction import Prediction
from app.services.ml.feature_vector import FEATURE_NAMES

PSI_MODERATE = 0.10
PSI_SIGNIFICANT = 0.25
MIN_WINDOW = 30


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


def drift_report(db: Session, window: int = 200) -> dict:
    """Reference = the `window` predictions before the most recent `window`;
    recent = the most recent `window`. Honest empty state below minimums.
    """
    rows = (
        db.query(Prediction)
        .order_by(Prediction.created_at.desc())
        .limit(window * 2)
        .all()
    )
    if len(rows) < MIN_WINDOW * 2:
        return {
            "status": "insufficient_history",
            "predictions_available": len(rows),
            "needed": MIN_WINDOW * 2,
            "note": "Drift detection activates once enough predictions accumulate — no drift is ever inferred from thin data.",
        }

    recent_rows = rows[: len(rows) // 2]
    reference_rows = rows[len(rows) // 2 :]

    model_drift = {}
    for attr in ("prob_up_10", "overall_ai_score", "confidence_score", "manipulation_risk"):
        psi = population_stability_index(
            np.array([getattr(r, attr) for r in reference_rows]),
            np.array([getattr(r, attr) for r in recent_rows]),
        )
        model_drift[attr] = {"psi": round(psi, 4), "band": _band(psi)}

    feature_drift = {}
    ref_snaps = [r.feature_snapshot for r in reference_rows if r.feature_snapshot]
    rec_snaps = [r.feature_snapshot for r in recent_rows if r.feature_snapshot]
    if len(ref_snaps) >= MIN_WINDOW and len(rec_snaps) >= MIN_WINDOW:
        for name in FEATURE_NAMES:
            ref_vals = np.array([s[name] for s in ref_snaps if name in s])
            rec_vals = np.array([s[name] for s in rec_snaps if name in s])
            if len(ref_vals) < MIN_WINDOW or len(rec_vals) < MIN_WINDOW:
                continue
            psi = population_stability_index(ref_vals, rec_vals)
            feature_drift[name] = {"psi": round(psi, 4), "band": _band(psi)}
        feature_drift = dict(sorted(feature_drift.items(), key=lambda kv: -kv[1]["psi"])[:10])

    worst_model = max((v["psi"] for v in model_drift.values()), default=0.0)
    worst_feature = max((v["psi"] for v in feature_drift.values()), default=0.0)

    return {
        "status": "ok",
        "reference_window": len(reference_rows),
        "recent_window": len(recent_rows),
        "model_drift": model_drift,
        "top_feature_drift": feature_drift,
        "worst_model_psi": round(worst_model, 4),
        "worst_feature_psi": round(worst_feature, 4),
    }


def drift_status_label(db: Session) -> str:
    """One-word summary of `drift_report()` — "insufficient_history", or
    the worse of the model/feature PSI bands. For call sites (e.g. the chat
    assistant's per-answer provenance) that need a quick status, not the
    full report."""
    report = drift_report(db)
    if report["status"] != "ok":
        return "insufficient_history"
    return _band(max(report["worst_model_psi"], report["worst_feature_psi"]))
