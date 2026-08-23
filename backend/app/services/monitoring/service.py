"""Platform health service — one report, every subsystem, explicit alerts.

Sections: model drift · feature drift · prediction accuracy · provider
failures · scanner health · AI performance (calibration) · API latency ·
database health. Alert rules are evaluated over the assembled report; every
alert names its threshold and the observed value.

The calibration-gap alert is deliberately severity `critical` — a
miscalibrated model is a product-integrity incident, not a metric
(architecture D10).
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models.prediction import Outcome, Prediction
from app.db.models.scan import ScanCycle
from app.services.evaluation.outcome_evaluator import build_calibration_report
from app.services.monitoring import counters
from app.services.monitoring.drift import PSI_SIGNIFICANT, drift_report

SCANNER_STALE_AFTER_MIN = 45          # ~3 missed 15-minute cycles
CALIBRATION_GAP_ALERT = 0.15
PROVIDER_FAILURE_RATE_ALERT = 0.20
EVALUATION_BACKLOG_ALERT = 200


def build_health_report(db: Session) -> dict:
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "drift": drift_report(db),
        "prediction_accuracy": _prediction_accuracy(db),
        "provider": _provider_health(),
        "scanner": _scanner_health(db),
        "api_latency": counters.latency_summary(),
        "database": _database_health(db),
    }
    report["alerts"] = _evaluate_alerts(report)
    return report


def _prediction_accuracy(db: Session) -> dict:
    calibration = build_calibration_report(db)
    total_predictions = db.query(Prediction).count()
    total_outcomes = db.query(Outcome).count()
    graded_ids = db.query(Outcome.prediction_id)
    backlog = (
        db.query(Prediction)
        .filter(Prediction.created_at < datetime.now(timezone.utc) - timedelta(days=30))
        .filter(~Prediction.id.in_(graded_ids))
        .count()
    )
    return {
        "total_predictions": total_predictions,
        "graded_outcomes": total_outcomes,
        "evaluation_backlog_over_30d": backlog,
        "calibration": calibration,
    }


def _provider_health() -> dict:
    snapshot = counters.snapshot_counters()
    calls = snapshot.get("provider.calls", 0)
    failures = snapshot.get("provider.failures", 0)
    return {
        "calls": calls,
        "failures": failures,
        "failure_rate": round(failures / calls, 4) if calls else 0.0,
        "by_vendor": {
            k.removeprefix("provider.failures."): v
            for k, v in snapshot.items()
            if k.startswith("provider.failures.")
        },
    }


def _scanner_health(db: Session) -> dict:
    latest = db.query(ScanCycle).order_by(ScanCycle.started_at.desc()).first()
    if latest is None:
        return {"status": "never_ran", "note": "No scan cycles recorded yet."}
    age_min = (datetime.now(timezone.utc) - latest.started_at).total_seconds() / 60
    return {
        "status": "stale" if age_min > SCANNER_STALE_AFTER_MIN else "healthy",
        "last_cycle_id": latest.id,
        "last_cycle_age_minutes": round(age_min, 1),
        "last_cycle": {
            "universe": latest.universe_size,
            "accepted": latest.accepted_count,
            "rejected": latest.rejected_count,
            "failed": latest.failed_count,
        },
    }


def _database_health(db: Session) -> dict:
    started = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
        ping_ms = (time.perf_counter() - started) * 1000
        return {"status": "healthy", "ping_ms": round(ping_ms, 2)}
    except Exception as exc:
        return {"status": "unreachable", "error": str(exc)[:200]}


def _evaluate_alerts(report: dict) -> list[dict]:
    alerts: list[dict] = []

    drift = report["drift"]
    if drift.get("status") == "ok":
        if drift["worst_model_psi"] > PSI_SIGNIFICANT:
            alerts.append(_alert("critical", "model_drift",
                                 f"Model output PSI {drift['worst_model_psi']} exceeds {PSI_SIGNIFICANT} — the model is producing a different distribution than its reference window."))
        if drift["worst_feature_psi"] > PSI_SIGNIFICANT:
            worst = next(iter(drift["top_feature_drift"]), "?")
            alerts.append(_alert("warning", "feature_drift",
                                 f"Feature PSI {drift['worst_feature_psi']} exceeds {PSI_SIGNIFICANT} (worst: {worst}) — model inputs have shifted regime."))

    accuracy = report["prediction_accuracy"]
    calibration = accuracy.get("calibration", {})
    for bucket in calibration.get("buckets", []):
        gap = bucket.get("calibration_gap")
        if gap is not None and abs(gap) > CALIBRATION_GAP_ALERT and bucket.get("count", 0) >= 20:
            alerts.append(_alert("critical", "calibration_gap",
                                 f"Calibration gap {gap:+.2f} in probability bucket {bucket['range']} over {bucket['count']} outcomes (limit ±{CALIBRATION_GAP_ALERT}) — the platform's probabilities are lying in this range. Product-integrity incident."))
    if accuracy["evaluation_backlog_over_30d"] > EVALUATION_BACKLOG_ALERT:
        alerts.append(_alert("warning", "evaluation_backlog",
                             f"{accuracy['evaluation_backlog_over_30d']} predictions older than 30 days remain ungraded (limit {EVALUATION_BACKLOG_ALERT}) — the truth loop is falling behind."))

    provider = report["provider"]
    if provider["calls"] >= 20 and provider["failure_rate"] > PROVIDER_FAILURE_RATE_ALERT:
        alerts.append(_alert("critical", "provider_failures",
                             f"Provider failure rate {provider['failure_rate']:.0%} over {provider['calls']} calls (limit {PROVIDER_FAILURE_RATE_ALERT:.0%})."))

    scanner = report["scanner"]
    if scanner.get("status") == "stale":
        alerts.append(_alert("critical", "scanner_stale",
                             f"Last scan cycle is {scanner['last_cycle_age_minutes']:.0f} minutes old (limit {SCANNER_STALE_AFTER_MIN}) — continuous scanning has stopped."))

    if report["database"]["status"] != "healthy":
        alerts.append(_alert("critical", "database_unreachable", "Database health check failed."))

    for route, stats in report["api_latency"].items():
        if stats["p95_ms"] > 5000 and stats["count"] >= 20:
            alerts.append(_alert("warning", "api_latency",
                                 f"{route} p95 latency {stats['p95_ms']:.0f}ms over {stats['count']} samples (limit 5000ms)."))

    return alerts


def _alert(severity: str, code: str, message: str) -> dict:
    return {"severity": severity, "code": code, "message": message}
