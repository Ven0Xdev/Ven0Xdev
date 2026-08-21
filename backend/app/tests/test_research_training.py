"""services/research/training.py — end-to-end walk-forward correctness
on synthetic data (populated directly into HistoricalBar so this test
never depends on real backfilled history). Proves: the pipeline runs
without crashing across every horizon shape, folds are strictly
chronological, purge/embargo actually removes samples whose label
resolves inside the test window, and the metrics additions (Calmar,
drawdown duration, deflated Sharpe) behave sanely at their edges."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app.db.models.historical_bar import HistoricalBar
from app.services.backtest.metrics import calmar_ratio, max_drawdown_duration
from app.services.research.dataset import ResearchSample
from app.services.research.features import RESEARCH_FEATURE_NAMES, FeatureSnapshot
from app.services.research.training import (
    FAMILIES,
    _purge_embargo,
    deflated_sharpe_probability,
    run_calendar_walk_forward,
)

SYMBOL = "TRAINTEST"


def _seed_daily_bars(db_session, symbol: str, start_year: int = 2020, end_year: int = 2026) -> None:
    rng = np.random.default_rng(7)
    start = datetime(start_year, 1, 1, tzinfo=timezone.utc)
    end = datetime(end_year, 8, 1, tzinfo=timezone.utc)
    ts = start
    price = 100.0
    rows = []
    while ts < end:
        if ts.weekday() < 5:  # trading days only
            price = max(5.0, price * (1 + rng.normal(0, 0.015)))
            rows.append(HistoricalBar(
                ticker_symbol=symbol, timeframe="1d", ts=ts,
                open=price, high=price * 1.01, low=price * 0.99, close=price, volume=float(rng.uniform(1e5, 1e6)),
                adjusted=True, session="regular", data_source="test", feed="unspecified",
            ))
        ts += timedelta(days=1)
    db_session.add_all(rows)
    db_session.commit()


class TestPurgeEmbargo:
    def _sample(self, entry_ts, exit_ts):
        snap = FeatureSnapshot(ticker_symbol=SYMBOL, as_of=entry_ts, values=dict.fromkeys(RESEARCH_FEATURE_NAMES, 0.0))
        return ResearchSample(SYMBOL, "1d", entry_ts, exit_ts, "NO_TRADE", 0, 0, 0.0, 100.0, snap)

    def test_a_sample_whose_exit_lands_inside_the_test_window_is_purged(self):
        test_start = datetime(2023, 1, 1, tzinfo=timezone.utc)
        train = [self._sample(datetime(2022, 12, 20, tzinfo=timezone.utc), datetime(2023, 1, 5, tzinfo=timezone.utc))]
        assert _purge_embargo(train, test_start) == []

    def test_a_sample_whose_exit_is_safely_before_the_embargo_boundary_survives(self):
        test_start = datetime(2023, 1, 1, tzinfo=timezone.utc)
        train = [self._sample(datetime(2022, 6, 1, tzinfo=timezone.utc), datetime(2022, 6, 5, tzinfo=timezone.utc))]
        assert len(_purge_embargo(train, test_start)) == 1

    def test_a_sample_inside_the_embargo_window_is_dropped_even_if_its_own_exit_is_fine(self):
        test_start = datetime(2023, 1, 1, tzinfo=timezone.utc)
        # exit is comfortably before test_start, but entry is only 2 days
        # before test_start — inside the 5-day embargo buffer.
        train = [self._sample(datetime(2022, 12, 30, tzinfo=timezone.utc), datetime(2022, 12, 31, tzinfo=timezone.utc))]
        assert _purge_embargo(train, test_start) == []


class TestDeflatedSharpe:
    def test_zero_with_fewer_than_two_trade_returns(self):
        assert deflated_sharpe_probability(2.0, n_trials=5, n_trade_returns=1) == 0.0

    def test_zero_with_no_trials(self):
        assert deflated_sharpe_probability(2.0, n_trials=0, n_trade_returns=50) == 0.0

    def test_a_modest_sharpe_with_few_trials_scores_higher_than_the_same_sharpe_with_many_trials(self):
        # Small enough Sharpe/sample size that both z-scores stay well
        # short of CDF saturation (~z>8 rounds to 1.0 either way) — the
        # point is the *direction* of the effect, not an extreme case.
        few_trials = deflated_sharpe_probability(0.3, n_trials=1, n_trade_returns=30)
        many_trials = deflated_sharpe_probability(0.3, n_trials=50, n_trade_returns=30)
        assert few_trials > many_trials  # more trials -> more skepticism required, same observed Sharpe

    def test_returns_a_genuine_probability(self):
        p = deflated_sharpe_probability(1.0, n_trials=5, n_trade_returns=100)
        assert 0.0 <= p <= 1.0


class TestMetricsAdditions:
    def test_calmar_ratio_zero_drawdown_never_divides_by_zero(self):
        assert calmar_ratio(10.0, 0.0) == 0.0

    def test_calmar_ratio_sane_direction(self):
        assert calmar_ratio(20.0, -10.0) == pytest.approx(2.0)

    def test_max_drawdown_duration_flat_curve_is_zero(self):
        assert max_drawdown_duration(np.array([100.0, 100.0, 100.0])) == 0

    def test_max_drawdown_duration_counts_the_longest_underwater_stretch(self):
        # peak at 110 (idx1), underwater for idx2..idx4 (3 bars), recovers at idx5.
        curve = np.array([100.0, 110.0, 105.0, 100.0, 108.0, 110.0])
        assert max_drawdown_duration(curve) == 3


def test_full_walk_forward_pipeline_runs_end_to_end_on_synthetic_daily_history(db_session):
    _seed_daily_bars(db_session, SYMBOL)
    report = run_calendar_walk_forward(db_session, "1d", [SYMBOL])

    assert report["dataset_summary"]["n_samples"] > 0
    assert report["leakage_checks"]["every_sample_exit_after_entry"] is True
    assert report["leakage_checks"]["folds_are_chronological"] is True
    assert report["leakage_checks"]["all_passed"] is True

    ran_folds = [f for f in report["folds"] if f["families"]]
    assert len(ran_folds) > 0
    test_years = [f["test_year"] for f in ran_folds]
    assert test_years == sorted(test_years)  # strictly chronological, never re-ordered

    for fold in ran_folds:
        family_names = {fam["family"] for fam in fold["families"]}
        assert family_names == set(FAMILIES)
        for fam in fold["families"]:
            assert fam["n_train"] > 0
            assert fam["n_test"] > 0
            assert 0.0 <= fam["turnover"] <= 1.0

    if report["selected_family"] is not None:
        assert report["selected_family"] in FAMILIES
        if report["holdout"] is not None:
            assert report["holdout"]["family"] == report["selected_family"]
            assert "result" in report["holdout"]
        if report["stress_test"] is not None:
            normal = report["stress_test"]["normal_costs"]
            stressed = report["stress_test"]["doubled_costs"]
            # Doubling costs can only ever hurt or match expectancy, never help it.
            assert stressed["expectancy_pct"] <= normal["expectancy_pct"] + 1e-9


def test_reports_honest_insufficient_data_note_instead_of_crashing_on_too_little_history(db_session):
    rng = np.random.default_rng(3)
    rows = []
    ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
    price = 50.0
    for _ in range(20):
        price = max(5.0, price * (1 + rng.normal(0, 0.01)))
        rows.append(HistoricalBar(
            ticker_symbol="TINYHIST", timeframe="1d", ts=ts,
            open=price, high=price, low=price, close=price, volume=1000.0,
            adjusted=True, session="regular", data_source="test", feed="unspecified",
        ))
        ts += timedelta(days=1)
    db_session.add_all(rows)
    db_session.commit()

    report = run_calendar_walk_forward(db_session, "1d", ["TINYHIST"])
    assert report["folds"] == []
    assert report["selected_family"] is None
    assert "note" in report
