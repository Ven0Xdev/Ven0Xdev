"""services/research/strategy_evaluation.py — end-to-end walk-forward
correctness for the five rule-based strategy families, on synthetic
HistoricalBar data (never depends on real backfilled history). Proves:
the harness runs without crashing, produces the same report shape
training.py's ML harness does (so registry.qualify_candidate can consume
either unchanged), selection never touches the holdout, and the report
never claims a fitted-parameter leakage guarantee it doesn't need."""
from datetime import datetime, timedelta, timezone

import numpy as np

from app.db.models.historical_bar import HistoricalBar
from app.services.research.registry import qualify_candidate
from app.services.research.strategies import STRATEGIES
from app.services.research.strategy_evaluation import run_strategy_walk_forward

SYMBOL = "STRATTEST"


def _seed_daily_bars(db_session, symbol: str, start_year: int = 2020, end_year: int = 2026) -> None:
    rng = np.random.default_rng(11)
    start = datetime(start_year, 1, 1, tzinfo=timezone.utc)
    end = datetime(end_year, 8, 1, tzinfo=timezone.utc)
    ts = start
    price = 100.0
    rows = []
    while ts < end:
        if ts.weekday() < 5:
            price = max(5.0, price * (1 + rng.normal(0, 0.015)))
            rows.append(HistoricalBar(
                ticker_symbol=symbol, timeframe="1d", ts=ts,
                open=price, high=price * 1.01, low=price * 0.99, close=price, volume=float(rng.uniform(1e5, 1e6)),
                adjusted=True, session="regular", data_source="test", feed="unspecified",
            ))
        ts += timedelta(days=1)
    db_session.add_all(rows)
    db_session.commit()


def test_strategy_walk_forward_runs_end_to_end_and_matches_ml_report_shape(db_session):
    _seed_daily_bars(db_session, SYMBOL)
    report = run_strategy_walk_forward(db_session, "1d", [SYMBOL])

    assert report["dataset_summary"]["n_samples"] > 0
    assert "selected_family" in report
    assert "holdout" in report
    assert "stress_test" in report
    assert "leakage_checks" in report
    assert "deflated_sharpe_probability" in report

    ran_folds = [f for f in report["folds"] if f["families"]]
    assert len(ran_folds) > 0
    for fold in ran_folds:
        family_names = {fam["family"] for fam in fold["families"]}
        assert family_names == set(STRATEGIES)


def test_leakage_checks_report_zero_fitted_parameters_not_a_horizon_scaled_embargo(db_session):
    _seed_daily_bars(db_session, SYMBOL)
    report = run_strategy_walk_forward(db_session, "20d", [SYMBOL])

    assert report["leakage_checks"]["no_fitted_parameters"] is True
    assert report["leakage_checks"]["all_passed"] is True
    # Deliberately does NOT claim an embargo width — there's no train set
    # for one to guard, unlike training.py's ML report.
    assert "embargo_days_used" not in report["leakage_checks"]


def test_selected_strategy_is_chosen_from_folds_only_never_referencing_holdout(db_session):
    _seed_daily_bars(db_session, SYMBOL)
    report = run_strategy_walk_forward(db_session, "1d", [SYMBOL])

    if report["selected_family"] is not None and report["holdout"] is not None:
        assert report["holdout"]["family"] == report["selected_family"]
        assert "walk-forward folds alone" in report["holdout"]["note"]


def test_stress_test_can_only_hurt_or_match_expectancy_never_help(db_session):
    _seed_daily_bars(db_session, SYMBOL)
    report = run_strategy_walk_forward(db_session, "1d", [SYMBOL])

    if report["stress_test"] is not None:
        normal = report["stress_test"]["normal_costs"]
        stressed = report["stress_test"]["doubled_costs"]
        assert stressed["expectancy_pct"] <= normal["expectancy_pct"] + 1e-9


def test_qualify_candidate_consumes_a_strategy_report_exactly_like_an_ml_report(db_session):
    """The whole point of matching training.py's report shape: the same,
    unweakened Phase 5 gate applies to a rule-based strategy as to a
    fitted model — proven here by actually calling qualify_candidate on
    a real strategy_evaluation report, not just asserting shape."""
    _seed_daily_bars(db_session, SYMBOL)
    report = run_strategy_walk_forward(db_session, "1d", [SYMBOL])

    model = qualify_candidate(db_session, "1d", report)
    assert model.state in ("HISTORICALLY_QUALIFIED", "REJECTED_OVERFIT")
    if report["selected_family"] is not None:
        assert model.family == report["selected_family"]
    else:
        assert model.family == "none"
        assert model.state == "REJECTED_OVERFIT"


def test_too_few_samples_is_reported_honestly_not_a_fabricated_result(db_session):
    report = run_strategy_walk_forward(db_session, "1d", ["NOSUCHSYMBOL"])
    assert report["selected_family"] is None
    assert report["folds"] == []
    assert "note" in report
