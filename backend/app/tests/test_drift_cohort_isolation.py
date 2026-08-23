"""Cohort-isolated, baseline-anchored drift monitoring
(services/monitoring/drift.py) — regression coverage for the live
incident where CRITICAL model_drift was computed by comparing whatever
predictions happened to be "most recent" against whatever was "before
that," with no guarantee either window was a comparable population.
"""
from datetime import datetime, timedelta, timezone

from app.db.models.prediction import Outcome, Prediction
from app.services.monitoring.drift import (
    MIN_VALID_SAMPLE,
    PSI_SIGNIFICANT,
    active_cohort_key,
    cohort_breakdown,
    drift_report,
    drift_status_label,
    rebuild_baseline,
)


def _jittered(center: float, n: int) -> list[float]:
    """A small, deterministic spread around `center` — real prediction
    output is never perfectly constant, and population_stability_index()
    treats a truly constant reference as "PSI undefined, report stable"
    (its own documented, correct fallback) rather than a real signal."""
    return [round(center + 0.01 * ((i % 5) - 2), 4) for i in range(n)]

COHORT_A = dict(
    engine_mode="HEURISTIC", model_version=None, risk_policy_version="risk-policy-v1",
    feature_schema_version="features-v1", provider_class="alpaca", data_mode="live",
)
COHORT_B = dict(
    engine_mode="HEURISTIC", model_version=None, risk_policy_version="risk-policy-v1",
    feature_schema_version="features-v1", provider_class="alpaca", data_mode="delayed",
)


def _prediction(created_at: datetime, cohort: dict, ticker="TEST", **overrides) -> Prediction:
    defaults = dict(
        ticker_symbol=ticker,
        created_at=created_at,
        current_price=1.00,
        liquidity_score=50, manipulation_risk=10, fundamental_score=50,
        technical_score=50, sentiment_score=50, catalyst_score=50,
        overall_ai_score=50.0, confidence_score=50.0,
        prob_up_5=0.4, prob_up_10=0.30, prob_up_20=0.15,
        prob_downside_before_upside=0.4,
        entry_zone_low=0.98, entry_zone_high=1.02,
        ideal_entry_price=1.00,
        stop_loss=0.90,
        take_profit_1=1.10, take_profit_2=1.20, take_profit_3=1.35,
        max_allocation_pct=2.0, risk_reward=2.0, holding_period_days=5,
        explanation="test", horizon_probabilities={}, feature_snapshot={}, shap_top_factors={},
        **cohort,
    )
    defaults.update(overrides)
    return Prediction(**defaults)


def _matured(db, prediction: Prediction) -> Prediction:
    """Attaches a graded Outcome so this prediction counts as matured
    ("closed live-data outcome") — the only kind of row a baseline may be
    built from."""
    db.add(prediction)
    db.commit()
    db.refresh(prediction)
    db.add(Outcome(
        prediction_id=prediction.id, horizon_days=5, realized_return_pct=1.0,
        hit_take_profit_1=False, hit_take_profit_2=False, hit_take_profit_3=False, hit_stop_loss=False,
        max_drawdown_pct=0.0, max_runup_pct=1.0,
    ))
    db.commit()
    return prediction


def _seed_cohort(
    db, cohort: dict, n: int, start: datetime, prob_up_10_values=None, matured=True,
) -> list[Prediction]:
    """Seeds `n` predictions for `cohort`, evenly spread over `n` minutes
    so ordering by created_at is deterministic. `matured=True` attaches a
    graded Outcome to each (a valid baseline population); `matured=False`
    leaves them provisional (a valid "recent" population, never a valid
    baseline one)."""
    rows = []
    for i in range(n):
        prob = prob_up_10_values[i] if prob_up_10_values is not None else 0.30
        pred = _prediction(start + timedelta(minutes=i), cohort, prob_up_10=prob)
        rows.append(_matured(db, pred) if matured else _add(db, pred))
    return rows


def _add(db, prediction: Prediction) -> Prediction:
    db.add(prediction)
    db.commit()
    db.refresh(prediction)
    return prediction


def test_reports_insufficient_history_with_no_predictions_at_all(db_session):
    assert active_cohort_key(db_session) is None
    report = drift_report(db_session)
    assert report["status"] == "insufficient_history"
    assert drift_status_label(db_session) == "insufficient_history"


def test_reports_insufficient_history_when_the_most_recent_row_predates_cohort_tracking(db_session):
    # A legacy row with no cohort provenance at all (every cohort field
    # NULL) — never guessed, never treated as its own valid cohort.
    _add(db_session, _prediction(
        datetime.now(timezone.utc), dict(
            engine_mode="HEURISTIC", model_version=None, risk_policy_version="risk-policy-v1",
            feature_schema_version=None, provider_class=None, data_mode=None,
        ),
    ))
    assert active_cohort_key(db_session) is None
    assert drift_report(db_session)["status"] == "insufficient_history"


def test_reports_insufficient_history_when_active_cohort_has_no_matured_baseline_yet(db_session):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _seed_cohort(db_session, COHORT_A, MIN_VALID_SAMPLE, start, matured=False)

    report = drift_report(db_session)
    assert report["status"] == "insufficient_history"
    assert report["cohort"]["data_mode"] == "live"
    assert "matured" in report["note"].lower()


def test_a_different_cohorts_data_never_contaminates_the_active_cohorts_baseline_or_score(db_session):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    # Cohort A: a large, matured, wildly different-looking population —
    # if this leaked into cohort B's comparison, it would either mask or
    # fabricate drift that has nothing to do with cohort B's own data.
    _seed_cohort(db_session, COHORT_A, MIN_VALID_SAMPLE * 2, start, prob_up_10_values=_jittered(0.05, MIN_VALID_SAMPLE * 2))

    # Cohort B (the ACTIVE one — most recent by created_at): its own
    # clean, self-consistent matured baseline plus a matching recent
    # window, deliberately identical in distribution to itself only.
    later = start + timedelta(days=1)
    _seed_cohort(db_session, COHORT_B, MIN_VALID_SAMPLE, later, prob_up_10_values=_jittered(0.30, MIN_VALID_SAMPLE))
    even_later = later + timedelta(hours=1)
    _seed_cohort(
        db_session, COHORT_B, MIN_VALID_SAMPLE, even_later,
        prob_up_10_values=_jittered(0.30, MIN_VALID_SAMPLE), matured=False,
    )

    assert active_cohort_key(db_session) == (
        "HEURISTIC", None, "risk-policy-v1", "features-v1", "alpaca", "delayed",
    )
    report = drift_report(db_session)
    assert report["status"] == "ok"
    assert report["baseline_sample_size"] == MIN_VALID_SAMPLE  # cohort B's own matured rows only, not A's
    # "recent" is every cohort-B row (matured + provisional alike, most
    # recent `window` of them) — maturity only gates what a BASELINE may
    # be built from, never what counts as a recent observation.
    assert report["recent_window"] == MIN_VALID_SAMPLE * 2
    # Self-consistent cohort B, isolated from cohort A's very different values -> stable, not fabricated drift.
    assert report["model_drift"]["prob_up_10"]["band"] == "stable"


def test_genuine_drift_in_a_clean_compatible_cohort_is_still_reported_and_still_blocks(db_session):
    """Never hides real drift: once a cohort has a valid baseline, a real
    divergence from it must still report 'significant' — cohort isolation
    is about excluding INCOMPATIBLE data, not about suppressing real
    findings on compatible data."""
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _seed_cohort(db_session, COHORT_A, MIN_VALID_SAMPLE, start, prob_up_10_values=_jittered(0.30, MIN_VALID_SAMPLE))
    later = start + timedelta(days=1)
    # Same cohort, but the model's own output distribution has genuinely
    # shifted hard (0.30 -> 0.90) — a real, compatible-cohort divergence.
    _seed_cohort(
        db_session, COHORT_A, MIN_VALID_SAMPLE, later,
        prob_up_10_values=_jittered(0.90, MIN_VALID_SAMPLE), matured=False,
    )

    report = drift_report(db_session)
    assert report["status"] == "ok"
    assert report["model_drift"]["prob_up_10"]["psi"] > PSI_SIGNIFICANT
    assert report["model_drift"]["prob_up_10"]["band"] == "significant"
    assert drift_status_label(db_session) == "significant"


def test_baseline_is_immutable_until_an_explicit_rebuild(db_session):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _seed_cohort(db_session, COHORT_A, MIN_VALID_SAMPLE, start, prob_up_10_values=[0.30] * MIN_VALID_SAMPLE)
    later = start + timedelta(hours=1)
    _seed_cohort(db_session, COHORT_A, MIN_VALID_SAMPLE, later, prob_up_10_values=[0.30] * MIN_VALID_SAMPLE, matured=False)

    first_report = drift_report(db_session)
    assert first_report["baseline_sample_size"] == MIN_VALID_SAMPLE

    # More matured data for the SAME cohort arrives — a sliding-window
    # design would silently pull this into "reference" on the next call.
    # An immutable baseline must not.
    even_later = later + timedelta(hours=1)
    _seed_cohort(db_session, COHORT_A, MIN_VALID_SAMPLE, even_later, prob_up_10_values=[0.30] * MIN_VALID_SAMPLE)

    second_report = drift_report(db_session)
    assert second_report["baseline_sample_size"] == MIN_VALID_SAMPLE  # unchanged — never silently recomputed
    assert second_report["baseline_established_at"] == first_report["baseline_established_at"]

    # Only an explicit rebuild changes it.
    key = active_cohort_key(db_session)
    rebuild_baseline(db_session, key)
    third_report = drift_report(db_session)
    assert third_report["baseline_sample_size"] == MIN_VALID_SAMPLE * 2


def test_cohort_breakdown_reports_real_grouped_counts_for_audit(db_session):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _seed_cohort(db_session, COHORT_A, 5, start, matured=False)
    _seed_cohort(db_session, COHORT_B, 3, start + timedelta(days=1), matured=False)

    rows = cohort_breakdown(db_session)
    total = sum(r["count"] for r in rows)
    assert total == 8
    modes = {r["data_mode"] for r in rows}
    assert {"live", "delayed"} <= modes
    assert all("count" in r and r["count"] > 0 for r in rows)
