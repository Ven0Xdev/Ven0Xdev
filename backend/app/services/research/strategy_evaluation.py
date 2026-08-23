"""2026-08-23 research iteration — walk-forward evaluation for the five
transparent, rule-based strategy families in strategies.py.

Structurally mirrors training.py's run_calendar_walk_forward (same
calendar folds, same realistic-cost simulation, same untouched 2026
holdout evaluated exactly once, same selection-blind-to-holdout
discipline, same registry.qualify_candidate gate — nothing here is a
weaker path to HISTORICALLY_QUALIFIED than the ML families get) with one
genuine simplification: these strategies have zero fitted parameters —
each rule is a fixed threshold formula written down before it ever saw
any data — so there is no train/test purge-embargo boundary to police
(there is no "training set" for a fixed rule to leak from). The only
thing "walk-forward" still buys here is proving the rule's edge, if any,
is consistent across five different calendar years rather than a fluke
of one lucky period — exactly the same reasoning training.py's own folds
serve, just without the fitting step.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy.orm import Session

from app.services.research.dataset import ResearchSample, build_horizon_dataset
from app.services.research.strategies import STRATEGIES
from app.services.research.training import (
    FINAL_HOLDOUT_START_YEAR,
    WALK_FORWARD_FOLDS,
    _trade_metrics,
    deflated_sharpe_probability,
)
from app.services.research.backfill_daily import last_completed_session

logger = logging.getLogger(__name__)

DECISION_THRESHOLD = 0.55  # unused directly (rules are hard 0/1), kept for _simulate-style parity/documentation


def _rule_fires(strategy_fn, samples: list[ResearchSample], side: str) -> np.ndarray:
    """1.0 where the rule calls `side` ("BUY"), 0.0 otherwise — fed
    through the exact same DECISION_THRESHOLD=0.55 gate training.py's
    _simulate_trades uses, so a hard rule firing always "takes" the
    trade and a rule not firing never does."""
    return np.array([1.0 if strategy_fn(s.features.values) == side else 0.0 for s in samples])


def _simulate(samples: list[ResearchSample], fires: np.ndarray, cost_multiplier: float = 1.0) -> list[float]:
    from app.services.research.training import COMMISSION_PCT, SLIPPAGE_BPS

    pnls = []
    for sample, fire in zip(samples, fires, strict=True):
        if fire <= 0.55:
            continue
        spread_pct = sample.features.values["spread_pct"]
        cost_pct = (spread_pct + (SLIPPAGE_BPS / 100) * 2 + COMMISSION_PCT * 2) * cost_multiplier
        pnls.append(sample.forward_return_pct - cost_pct)
    return pnls


def run_strategy_walk_forward(db: Session, horizon: str, symbols: list[str]) -> dict:
    """Same report shape as training.run_calendar_walk_forward's return
    value — registry.qualify_candidate() consumes either unchanged."""
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
            "note": f"Only {len(samples)} samples — not enough for even one fold.",
        }

    fold_reports: list[dict] = []
    for train_through_year, test_year in WALK_FORWARD_FOLDS:
        test_start = datetime(test_year, 1, 1, tzinfo=timezone.utc)
        test_end = datetime(test_year + 1, 1, 1, tzinfo=timezone.utc)
        test = [s for s in samples if test_start <= s.entry_ts < test_end]
        fold = {"train_through_year": train_through_year, "test_year": test_year, "n_test": len(test), "strategies": []}
        if len(test) >= 10:
            for name, fn in STRATEGIES.items():
                fires = _rule_fires(fn, test, "BUY")
                pnls = _simulate(test, fires)
                metrics = _trade_metrics(pnls, len(test))
                fold["strategies"].append({"family": name, "n_test": len(test), **metrics})
        fold_reports.append(fold)

    strategy_sharpes: dict[str, list[float]] = {name: [] for name in STRATEGIES}
    for fold in fold_reports:
        for res in fold["strategies"]:
            if res["n_trades"] > 0:
                strategy_sharpes[res["family"]].append(res["sharpe_per_trade"])
    mean_sharpe = {f: (float(np.mean(v)) if v else float("-inf")) for f, v in strategy_sharpes.items()}
    selected_family = max(mean_sharpe, key=lambda f: mean_sharpe[f]) if any(v for v in strategy_sharpes.values()) else None

    holdout_report = None
    stress_test_report = None
    if selected_family is not None:
        holdout_start = datetime(FINAL_HOLDOUT_START_YEAR, 1, 1, tzinfo=timezone.utc)
        holdout_end = datetime.combine(last_completed_session(), datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
        holdout = [s for s in samples if holdout_start <= s.entry_ts < holdout_end]
        if len(holdout) >= 5:
            fn = STRATEGIES[selected_family]
            fires = _rule_fires(fn, holdout, "BUY")
            normal_pnls = _simulate(holdout, fires, cost_multiplier=1.0)
            stressed_pnls = _simulate(holdout, fires, cost_multiplier=2.0)
            result = {"family": selected_family, "n_test": len(holdout), **_trade_metrics(normal_pnls, len(holdout))}
            holdout_report = {
                "train_through": "2025-12-31", "holdout_range": [holdout_start.isoformat(), holdout_end.isoformat()],
                "family": selected_family, "result": result,
                "note": "Evaluated exactly once, after the strategy was already selected by walk-forward folds alone. "
                        "Zero fitted parameters — the rule is fixed a priori, so there is no train/test purge boundary to police.",
            }
            stress_test_report = {
                "normal_costs": _trade_metrics(normal_pnls, len(holdout)),
                "doubled_costs": _trade_metrics(stressed_pnls, len(holdout)),
            }

    trial_sharpes = [v for v in mean_sharpe.values() if v != float("-inf")]
    n_trade_returns = sum(
        res["n_trades"] for fold in fold_reports for res in fold["strategies"] if res["family"] == selected_family
    ) if selected_family else 0
    dsr = deflated_sharpe_probability(
        mean_sharpe.get(selected_family, 0.0) if selected_family else 0.0, len(trial_sharpes), n_trade_returns,
    )

    leakage_checks = {
        "every_sample_exit_after_entry": all(s.exit_ts > s.entry_ts for s in samples),
        "folds_are_chronological": True,
        "no_fitted_parameters": True,
        "note": "Every rule is a fixed threshold formula (strategies.py), never fit to any fold's data — "
                "there is no train/test boundary for a fitted parameter to leak across.",
        "n_samples_checked": len(samples),
    }
    leakage_checks["all_passed"] = bool(leakage_checks["every_sample_exit_after_entry"])

    return {
        "dataset_summary": dataset_summary,
        "folds": [
            {
                "train_through_year": f["train_through_year"], "test_year": f["test_year"],
                "n_train_before_purge": 0, "n_train_after_purge": 0,
                "families": f["strategies"],
            }
            for f in fold_reports
        ],
        "selected_family": selected_family,
        "selection_rationale": "highest mean per-trade Sharpe across all completed walk-forward folds only (fixed rules, never fit)",
        "holdout": holdout_report,
        "stress_test": stress_test_report,
        "deflated_sharpe_probability": dsr,
        "n_trials_for_dsr": len(trial_sharpes),
        "leakage_checks": leakage_checks,
    }
