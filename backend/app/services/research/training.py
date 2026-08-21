"""Phase 4 — calendar-anchored walk-forward training, without cheating.

Expanding-window calendar folds (train through year Y, test year Y+1),
each with a purge+embargo boundary using every sample's own `exit_ts`
(not just `entry_ts`) — a training sample whose label only resolves
inside or after the test window is dropped from that fold's training
set, exactly like services/ml/validation.py's purged_walk_forward_splits
but anchored to real calendar years instead of index-fraction splits,
per this phase's explicit "Train through 2021 -> test 2022 ..." spec.

Five model families are compared on every fold: an "existing heuristic"
style feature-driven prior (Same scoring approach as the live platform's
EnsembleModel._heuristic_prior, on this pipeline's own feature names —
the two schemas are not vector-compatible, see features.py's module
docstring for why), simple logistic regression, and real LightGBM/
XGBoost/CatBoost (services/ml/gbm_models.py, the same wrappers the live
ensemble uses). The live "existing ensemble" itself is included only as
an approximate reference point on the "10d" horizon (the one horizon
whose semantics roughly match its own native +10%-within-10-days task)
— never presented as a like-for-like comparison on any other horizon.

The final year (2026 through the last completed month) is an UNTOUCHED
holdout: it is evaluated exactly once, only for the single family
selected by walk-forward performance alone (2022-2025), never used to
choose that family or tune anything.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import norm
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from app.services.backtest.metrics import (
    calmar_ratio,
    expectancy,
    max_drawdown_duration,
    max_drawdown_pct,
    profit_factor,
    sharpe_ratio,
    sortino_ratio,
    win_rate,
)
from app.services.ml.calibration import ProbabilityCalibrator
from app.services.ml.gbm_models import CatBoostModel, LightGBMModel, XGBoostModel
from app.services.research.backfill_daily import last_completed_session
from app.services.research.dataset import ResearchSample, build_horizon_dataset
from app.services.research.features import RESEARCH_FEATURE_NAMES

logger = logging.getLogger(__name__)

FAMILIES = ("heuristic", "logistic", "lightgbm", "xgboost", "catboost")
GBM_FAMILIES = {"lightgbm": LightGBMModel, "xgboost": XGBoostModel, "catboost": CatBoostModel}

# Expanding walk-forward folds — train-through-year -> test-year.
WALK_FORWARD_FOLDS = [(2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025)]
FINAL_HOLDOUT_START_YEAR = 2026

EMBARGO_DAYS = 5.0
SLIPPAGE_BPS = 5.0  # 0.05% per leg, conservative for this liquid large-cap/ETF universe
COMMISSION_PCT = 0.0  # disclosed explicitly: modern retail brokers are commission-free; not hidden, not assumed away
STARTING_EQUITY = 100_000.0
DECISION_THRESHOLD = 0.55  # calibrated P(BUY) required to "take" a trade in the simulation below


@dataclass
class FamilyResult:
    family: str
    n_train: int
    n_test: int
    buy_auc: float | None
    sell_auc: float | None
    buy_brier: float | None
    buy_calibration_gap: float | None
    n_trades: int
    total_return_pct: float
    sharpe_per_trade: float
    sortino_per_trade: float
    max_drawdown_pct: float
    max_drawdown_duration_trades: int
    calmar: float
    profit_factor: float
    expectancy_pct: float
    win_rate_pct: float
    turnover: float  # trades taken / test samples available


@dataclass
class FoldReport:
    train_through_year: int
    test_year: int
    n_train_before_purge: int
    n_train_after_purge: int
    families: list[FamilyResult] = field(default_factory=list)


def _matrix(samples: list[ResearchSample]) -> np.ndarray:
    return np.array([s.features.as_vector() for s in samples]) if samples else np.empty((0, len(RESEARCH_FEATURE_NAMES)))


def _heuristic_scores(samples: list[ResearchSample]) -> tuple[np.ndarray, np.ndarray]:
    """Same feature-driven-prior style as the live platform's
    EnsembleModel._heuristic_prior — see module docstring."""
    buy, sell = [], []
    for s in samples:
        f = s.features.values
        bullish = 0.0
        bullish += np.clip((f["rsi_14"] - 50) / 50, -1, 1) * 0.20
        bullish += np.clip(f["macd_histogram"], -1, 1) * 0.15
        bullish += np.clip(f["regime_slope_pct"] / 5, -1, 1) * 0.25
        bullish += np.clip(f["relative_strength_spy_10d_pct"] / 10, -1, 1) * 0.20
        bullish += np.clip(f["news_sentiment_avg_7d"], -1, 1) * 0.10 * f["news_data_available"]
        bullish += np.clip(f["fundamental_revenue_yoy_pct"] / 20, -1, 1) * 0.10 * f["fundamental_data_available"]
        buy.append(float(np.clip(0.3 + bullish * 0.3, 0.02, 0.95)))
        sell.append(float(np.clip(0.3 - bullish * 0.3, 0.02, 0.95)))
    return np.array(buy), np.array(sell)


def _purge_embargo(train: list[ResearchSample], test_start: datetime) -> list[ResearchSample]:
    embargo_cutoff = test_start - timedelta(days=EMBARGO_DAYS)
    return [s for s in train if s.exit_ts < test_start and s.entry_ts < embargo_cutoff]


def _fit_predict_gbm(model_cls, X_train: np.ndarray, y_train: np.ndarray, X_test: np.ndarray) -> np.ndarray | None:
    if len(np.unique(y_train)) < 2:
        return None
    model = model_cls(random_state=42).fit(X_train, y_train)
    return model.predict_proba_positive(X_test)


def _fit_predict_logistic(X_train: np.ndarray, y_train: np.ndarray, X_test: np.ndarray) -> np.ndarray | None:
    """Unlike the GBM families (scale-invariant by construction), plain
    logistic regression needs its inputs on comparable scales to
    converge reliably — this pipeline's own feature set mixes RSI (0-100)
    with percent-return features that can run into the hundreds, which
    without scaling either fails to converge or silently under-weights
    the larger-magnitude features. The scaler is fit on the training
    fold only, never on test/holdout rows — fitting it on the full
    dataset would itself be a (mild) leakage vector."""
    if len(np.unique(y_train)) < 2:
        return None
    scaler = StandardScaler().fit(X_train)
    model = LogisticRegression(max_iter=2000).fit(scaler.transform(X_train), y_train)
    return model.predict_proba(scaler.transform(X_test))[:, 1]


def _calibrated(raw_probs: np.ndarray, y_train_for_fit: np.ndarray, raw_train_probs: np.ndarray) -> np.ndarray:
    calibrator = ProbabilityCalibrator().fit(raw_train_probs, y_train_for_fit)
    return np.clip(calibrator.transform(raw_probs), 0.01, 0.99)


def _discrimination_and_calibration(y: np.ndarray, probs: np.ndarray) -> dict:
    out: dict = {}
    if len(np.unique(y)) == 2:
        out["auc"] = float(roc_auc_score(y, probs))
    else:
        out["auc"] = None
    out["brier"] = float(np.mean((probs - y) ** 2))
    out["calibration_gap"] = float(abs(probs.mean() - y.mean()))
    return out


def _simulate_trades(test: list[ResearchSample], buy_probs: np.ndarray, cost_multiplier: float = 1.0) -> list[float]:
    """Long-only (this platform never shorts): "take" every test sample
    whose calibrated P(BUY) clears DECISION_THRESHOLD, realize its real
    forward_return_pct minus a round-trip cost (real per-sample
    spread_pct feature + slippage + commission, both legs).
    `cost_multiplier=2.0` is the stress test."""
    pnls = []
    for sample, p in zip(test, buy_probs, strict=True):
        if p <= DECISION_THRESHOLD:
            continue
        spread_pct = sample.features.values["spread_pct"]
        cost_pct = (spread_pct + (SLIPPAGE_BPS / 100) * 2 + COMMISSION_PCT * 2) * cost_multiplier
        pnls.append(sample.forward_return_pct - cost_pct)
    return pnls


def _trade_metrics(pnls: list[float], n_test: int) -> dict:
    arr = np.array(pnls)
    if len(arr) == 0:
        return {
            "n_trades": 0, "total_return_pct": 0.0, "sharpe_per_trade": 0.0, "sortino_per_trade": 0.0,
            "max_drawdown_pct": 0.0, "max_drawdown_duration_trades": 0, "calmar": 0.0, "profit_factor": 0.0,
            "expectancy_pct": 0.0, "win_rate_pct": 0.0, "turnover": 0.0,
        }
    equity = STARTING_EQUITY * np.cumprod(1 + arr / 100)
    total_return_pct = float((equity[-1] / STARTING_EQUITY - 1) * 100)
    mdd = max_drawdown_pct(equity)
    return {
        "n_trades": len(arr),
        "total_return_pct": total_return_pct,
        # Per-trade, NOT annualized (periods_per_year=1) — these horizons don't
        # share a common trading frequency, so a fabricated annualization would
        # mislead more than a plainly-labeled per-trade statistic.
        "sharpe_per_trade": sharpe_ratio(arr / 100, periods_per_year=1),
        "sortino_per_trade": sortino_ratio(arr / 100, periods_per_year=1),
        "max_drawdown_pct": mdd,
        "max_drawdown_duration_trades": max_drawdown_duration(equity),
        "calmar": calmar_ratio(total_return_pct, mdd),
        "profit_factor": profit_factor(arr),
        "expectancy_pct": expectancy(arr),
        "win_rate_pct": win_rate(arr),
        "turnover": len(arr) / n_test if n_test else 0.0,
    }


def _run_family(family: str, train: list[ResearchSample], test: list[ResearchSample]) -> FamilyResult:
    X_train, X_test = _matrix(train), _matrix(test)
    y_buy_train = np.array([s.is_buy for s in train])
    y_buy_test = np.array([s.is_buy for s in test])
    y_sell_train = np.array([s.is_sell for s in train])
    y_sell_test = np.array([s.is_sell for s in test])

    buy_raw_train: np.ndarray | None
    buy_raw_test: np.ndarray | None
    sell_raw_train: np.ndarray | None
    sell_raw_test: np.ndarray | None
    if family == "heuristic":
        buy_raw_train, sell_raw_train = _heuristic_scores(train)
        buy_raw_test, sell_raw_test = _heuristic_scores(test)
    elif family == "logistic":
        buy_raw_test = _fit_predict_logistic(X_train, y_buy_train, X_test)
        buy_raw_train = _fit_predict_logistic(X_train, y_buy_train, X_train)
        sell_raw_test = _fit_predict_logistic(X_train, y_sell_train, X_test)
        sell_raw_train = _fit_predict_logistic(X_train, y_sell_train, X_train)
    else:
        model_cls = GBM_FAMILIES[family]
        buy_raw_test = _fit_predict_gbm(model_cls, X_train, y_buy_train, X_test)
        buy_raw_train = _fit_predict_gbm(model_cls, X_train, y_buy_train, X_train)
        sell_raw_test = _fit_predict_gbm(model_cls, X_train, y_sell_train, X_test)
        sell_raw_train = _fit_predict_gbm(model_cls, X_train, y_sell_train, X_train)

    if buy_raw_test is None:
        buy_probs = np.full(len(test), 0.3)
        buy_disc: dict = {"auc": None, "brier": None, "calibration_gap": None}
    else:
        # buy_raw_train is None only when buy_raw_test is also None (both
        # come from the same fit, gated on the same y_buy_train class-balance
        # check) — this branch already proved buy_raw_test is not None.
        assert buy_raw_train is not None
        buy_probs = _calibrated(buy_raw_test, y_buy_train, buy_raw_train)
        buy_disc = _discrimination_and_calibration(y_buy_test, buy_probs)

    sell_disc: dict = {"auc": None}
    if sell_raw_test is not None:
        assert sell_raw_train is not None
        sell_probs = _calibrated(sell_raw_test, y_sell_train, sell_raw_train)
        sell_disc = _discrimination_and_calibration(y_sell_test, sell_probs)

    pnls = _simulate_trades(test, buy_probs)
    trade_metrics = _trade_metrics(pnls, len(test))

    return FamilyResult(
        family=family, n_train=len(train), n_test=len(test),
        buy_auc=buy_disc.get("auc"), sell_auc=sell_disc.get("auc"),
        buy_brier=buy_disc.get("brier"), buy_calibration_gap=buy_disc.get("calibration_gap"),
        **trade_metrics,
    )


def run_calendar_walk_forward(db: Session, horizon: str, symbols: list[str]) -> dict:
    """The complete Phase 4 report for one horizon: every fold, every
    family, plus the untouched final holdout for whichever family the
    walk-forward folds alone select."""
    samples = build_horizon_dataset(db, symbols, horizon)
    samples.sort(key=lambda s: s.entry_ts)

    dataset_summary = {
        "horizon": horizon, "n_samples": len(samples),
        "n_symbols_with_data": len({s.ticker_symbol for s in samples}),
        "date_range": [samples[0].entry_ts.isoformat(), samples[-1].entry_ts.isoformat()] if samples else None,
        "label_distribution": {
            "BUY": sum(1 for s in samples if s.label == "BUY"),
            "SELL": sum(1 for s in samples if s.label == "SELL"),
            "NO_TRADE": sum(1 for s in samples if s.label == "NO_TRADE"),
        },
    }
    if len(samples) < 60:
        return {
            "dataset_summary": dataset_summary, "folds": [], "selected_family": None,
            "holdout": None, "stress_test": None, "leakage_checks": {},
            "note": f"Only {len(samples)} samples — need at least 60 for even one purged fold. "
                    "Real coverage is still being backfilled; rerun once more history lands.",
        }

    fold_reports: list[FoldReport] = []
    for train_through_year, test_year in WALK_FORWARD_FOLDS:
        test_start = datetime(test_year, 1, 1, tzinfo=timezone.utc)
        test_end = datetime(test_year + 1, 1, 1, tzinfo=timezone.utc)
        train_all = [s for s in samples if s.entry_ts < test_start]
        test = [s for s in samples if test_start <= s.entry_ts < test_end]
        train = _purge_embargo(train_all, test_start)
        if len(train) < 30 or len(test) < 10:
            fold_reports.append(FoldReport(train_through_year, test_year, len(train_all), len(train)))
            continue
        fold = FoldReport(train_through_year, test_year, len(train_all), len(train))
        for family in FAMILIES:
            fold.families.append(_run_family(family, train, test))
        fold_reports.append(fold)

    # Select the family with the best MEAN walk-forward Sharpe across
    # folds that actually ran — selection uses ONLY these folds, never
    # the untouched holdout below.
    family_sharpes: dict[str, list[float]] = {f: [] for f in FAMILIES}
    for fold in fold_reports:
        for fam_result in fold.families:
            family_sharpes[fam_result.family].append(fam_result.sharpe_per_trade)
    mean_sharpe = {f: (float(np.mean(v)) if v else float("-inf")) for f, v in family_sharpes.items()}
    selected_family = max(mean_sharpe, key=lambda f: mean_sharpe[f]) if any(v for v in family_sharpes.values()) else None

    holdout_report = None
    stress_test_report = None
    if selected_family is not None:
        holdout_start = datetime(FINAL_HOLDOUT_START_YEAR, 1, 1, tzinfo=timezone.utc)
        holdout_end = datetime.combine(last_completed_session(), datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
        train_all = [s for s in samples if s.entry_ts < holdout_start]
        holdout = [s for s in samples if holdout_start <= s.entry_ts < holdout_end]
        train = _purge_embargo(train_all, holdout_start)
        if len(train) >= 30 and len(holdout) >= 5:
            result = _run_family(selected_family, train, holdout)
            holdout_report = {
                "train_through": "2025-12-31", "holdout_range": [holdout_start.isoformat(), holdout_end.isoformat()],
                "family": selected_family, "result": result.__dict__,
                "note": "Evaluated exactly once, after the family was already selected by walk-forward folds alone.",
            }
            # Stress test: same selected family, same untouched holdout, doubled costs.
            X_train, y_train = _matrix(train), np.array([s.is_buy for s in train])
            X_holdout = _matrix(holdout)
            buy_raw_holdout: np.ndarray | None
            buy_raw_train: np.ndarray | None
            if selected_family == "heuristic":
                buy_raw_holdout, _ = _heuristic_scores(holdout)
                buy_raw_train, _ = _heuristic_scores(train)
            elif selected_family == "logistic":
                buy_raw_holdout = _fit_predict_logistic(X_train, y_train, X_holdout)
                buy_raw_train = _fit_predict_logistic(X_train, y_train, X_train)
            else:
                model_cls = GBM_FAMILIES[selected_family]
                buy_raw_holdout = _fit_predict_gbm(model_cls, X_train, y_train, X_holdout)
                buy_raw_train = _fit_predict_gbm(model_cls, X_train, y_train, X_train)
            if buy_raw_holdout is not None:
                assert buy_raw_train is not None
                buy_probs = _calibrated(buy_raw_holdout, y_train, buy_raw_train)
                normal_pnls = _simulate_trades(holdout, buy_probs, cost_multiplier=1.0)
                stressed_pnls = _simulate_trades(holdout, buy_probs, cost_multiplier=2.0)
                stress_test_report = {
                    "normal_costs": _trade_metrics(normal_pnls, len(holdout)),
                    "doubled_costs": _trade_metrics(stressed_pnls, len(holdout)),
                }

    # DSR/PBO: treat each family's mean walk-forward Sharpe as one "trial" —
    # see deflated_sharpe_probability's own docstring for the honest scope
    # of this approximation.
    trial_sharpes = [v for v in mean_sharpe.values() if v != float("-inf")]
    n_trade_returns = sum(fr.n_trades for fold in fold_reports for fr in fold.families if fr.family == selected_family) if selected_family else 0
    dsr = deflated_sharpe_probability(
        mean_sharpe.get(selected_family, 0.0) if selected_family else 0.0, len(trial_sharpes), n_trade_returns,
    )

    leakage_checks = _run_leakage_checks(samples, fold_reports)

    return {
        "dataset_summary": dataset_summary,
        "folds": [
            {
                "train_through_year": f.train_through_year, "test_year": f.test_year,
                "n_train_before_purge": f.n_train_before_purge, "n_train_after_purge": f.n_train_after_purge,
                "families": [fam.__dict__ for fam in f.families],
            }
            for f in fold_reports
        ],
        "selected_family": selected_family,
        "selection_rationale": "highest mean per-trade Sharpe across all completed walk-forward folds only",
        "holdout": holdout_report,
        "stress_test": stress_test_report,
        "deflated_sharpe_probability": dsr,
        "n_trials_for_dsr": len(trial_sharpes),
        "leakage_checks": leakage_checks,
    }


def deflated_sharpe_probability(observed_sharpe: float, n_trials: int, n_trade_returns: int) -> float:
    """A documented approximation of Bailey & Lopez de Prado's Deflated
    Sharpe Ratio — not the full closed form (which additionally corrects
    for the return distribution's own skew/kurtosis). Treats the
    observed Sharpe as one draw from Normal(true_SR, 1/sqrt(n)) and asks:
    does it clear the expected maximum of `n_trials` such draws under a
    null of zero true skill (the asymptotic expected-max-of-n-Gaussians
    approximation, sqrt(2*ln(n)))? Returns the probability (0..1) that
    the selected model's edge is real, not the best of N noisy trials.
    0.0 for fewer than 2 trade returns or 0 trials — never a fabricated
    confidence from too little evidence.
    """
    if n_trade_returns < 2 or n_trials < 1:
        return 0.0
    standard_error = 1.0 / np.sqrt(n_trade_returns)
    expected_max_null = np.sqrt(2 * np.log(n_trials)) if n_trials > 1 else 0.0
    z = (observed_sharpe - expected_max_null * standard_error) / standard_error
    return float(norm.cdf(z))


def _run_leakage_checks(samples: list[ResearchSample], folds: list[FoldReport]) -> dict:
    """Automated self-checks recorded verbatim in the registry —
    genuinely re-derived from the actual sample timestamps, not asserted."""
    exit_after_entry = all(s.exit_ts > s.entry_ts for s in samples)
    checks = {
        "every_sample_exit_after_entry": exit_after_entry,
        "folds_are_chronological": all(
            folds[i].test_year < folds[i + 1].test_year for i in range(len(folds) - 1)
        ) if len(folds) > 1 else True,
        "n_samples_checked": len(samples),
    }
    checks["all_passed"] = bool(exit_after_entry and checks["folds_are_chronological"])
    return checks
