"""Monitoring: PSI math, counters, health report shape, and alert rules."""
from datetime import datetime, timedelta

import numpy as np

from app.db.models.scan import ScanCycle
from app.services.monitoring import counters
from app.services.monitoring.drift import population_stability_index
from app.services.monitoring.service import SCANNER_STALE_AFTER_MIN, build_health_report


def test_psi_zero_for_identical_distributions():
    rng = np.random.default_rng(1)
    sample = rng.normal(50, 10, 2000)
    assert population_stability_index(sample, sample) < 0.01


def test_psi_detects_shifted_distribution():
    rng = np.random.default_rng(2)
    reference = rng.normal(50, 10, 2000)
    shifted = rng.normal(70, 10, 2000)
    assert population_stability_index(reference, shifted) > 0.25


def test_psi_stable_on_constant_reference():
    assert population_stability_index(np.full(100, 5.0), np.full(100, 7.0)) == 0.0


def test_counters_and_latency_summary():
    counters.reset_for_tests()
    counters.increment("provider.calls", 10)
    counters.increment("provider.failures", 2)
    for ms in (10, 20, 30, 400):
        counters.record_latency("GET /x", ms)
    snap = counters.snapshot_counters()
    assert snap["provider.calls"] == 10
    latency = counters.latency_summary()["GET /x"]
    assert latency["count"] == 4
    assert latency["p50_ms"] <= latency["p95_ms"] <= latency["max_ms"]


def test_health_report_covers_every_subsystem(db_session):
    counters.reset_for_tests()
    report = build_health_report(db_session)
    for section in ("drift", "prediction_accuracy", "provider", "scanner", "api_latency", "database", "alerts"):
        assert section in report
    assert report["database"]["status"] == "healthy"
    # Fresh DB: drift must report insufficient history, never fake drift.
    assert report["drift"]["status"] == "insufficient_history"


def test_stale_scanner_raises_critical_alert(db_session):
    counters.reset_for_tests()
    db_session.add(ScanCycle(
        provider_name="mock",
        started_at=datetime.utcnow() - timedelta(minutes=SCANNER_STALE_AFTER_MIN + 30),
        finished_at=datetime.utcnow() - timedelta(minutes=SCANNER_STALE_AFTER_MIN + 29),
        universe_size=10, accepted_count=8, rejected_count=2,
    ))
    db_session.commit()
    report = build_health_report(db_session)
    assert report["scanner"]["status"] == "stale"
    codes = {a["code"] for a in report["alerts"]}
    assert "scanner_stale" in codes


def test_provider_failure_rate_alert(db_session):
    counters.reset_for_tests()
    counters.increment("provider.calls", 50)
    counters.increment("provider.failures", 20)
    counters.increment("provider.failures.Finnhub", 20)
    report = build_health_report(db_session)
    codes = {a["code"] for a in report["alerts"]}
    assert "provider_failures" in codes
    assert report["provider"]["by_vendor"]["Finnhub"] == 20


def test_monitoring_endpoint(client):
    response = client.get("/api/v1/monitoring/health")
    assert response.status_code == 200
    body = response.json()
    assert "alerts" in body and "drift" in body


def test_portfolio_health_endpoint(client):
    response = client.get("/api/v1/portfolio/health")
    assert response.status_code == 200
    body = response.json()
    assert body["health_grade"] in "ABCD"
