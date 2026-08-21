"""Phase 5 — historical qualification gate.

Turns one services/research/training.py report into a persisted
ResearchModel row, honestly HISTORICALLY_QUALIFIED or REJECTED_OVERFIT —
never silent, never optimistic. Every threshold below is a fixed,
documented number (a "low-risk mandate" configuration), not something
fit to make a particular candidate pass.

This function NEVER writes to ShadowPosition, NcsSignal, or ModelVersion
— a historical qualification here has zero effect on what the live
platform serves. It also never auto-starts Research Canary (Phase 6) —
qualification and the operator's manual Canary opt-in are two separate,
independently gated actions.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models.research_model import ResearchModel

MIN_SYMBOLS_FOR_DIVERSITY = 3
MIN_HOLDOUT_TRADES = 5
MAX_ACCEPTABLE_DRAWDOWN_PCT = -15.0  # the low-risk mandate's drawdown ceiling
MAX_ACCEPTABLE_CALIBRATION_GAP = 0.15
MIN_STRESSED_EXPECTANCY_PCT = -0.5  # doubling costs may hurt, but not collapse, expectancy


def qualify_candidate(db: Session, horizon: str, report: dict) -> ResearchModel:
    """Applies every Phase 5 criterion to a training report and persists
    the verdict. Returns the new ResearchModel row (state either
    HISTORICALLY_QUALIFIED or REJECTED_OVERFIT, rejection_reason always
    set on rejection, never blank)."""
    reasons: list[str] = []

    leakage = report.get("leakage_checks") or {}
    if not leakage.get("all_passed"):
        reasons.append(f"A leakage self-check failed: {leakage}")

    selected_family = report.get("selected_family")
    if selected_family is None:
        reasons.append(report.get("note") or "No family produced a usable out-of-sample result on the walk-forward folds.")

    holdout = report.get("holdout")
    if selected_family is not None and holdout is None:
        reasons.append("No untouched final holdout evaluation exists yet (insufficient post-2025 history) — cannot qualify without one.")
    elif holdout is not None:
        result = holdout["result"]
        if result["n_trades"] < MIN_HOLDOUT_TRADES:
            reasons.append(f"Only {result['n_trades']} untouched-holdout trades — need at least {MIN_HOLDOUT_TRADES} for a reliable read.")
        if result["expectancy_pct"] <= 0:
            reasons.append(f"Untouched-holdout expectancy after realistic costs is {result['expectancy_pct']:.4f}% — not positive.")
        if result["max_drawdown_pct"] < MAX_ACCEPTABLE_DRAWDOWN_PCT:
            reasons.append(
                f"Untouched-holdout max drawdown {result['max_drawdown_pct']:.2f}% exceeds the "
                f"{MAX_ACCEPTABLE_DRAWDOWN_PCT}% low-risk mandate."
            )
        gap = result.get("buy_calibration_gap")
        if gap is not None and gap > MAX_ACCEPTABLE_CALIBRATION_GAP:
            reasons.append(f"Calibration gap {gap:.4f} exceeds the {MAX_ACCEPTABLE_CALIBRATION_GAP} tolerance — probabilities are not honest enough yet.")

    stress = report.get("stress_test")
    if stress is not None:
        stressed_expectancy = stress["doubled_costs"]["expectancy_pct"]
        if stressed_expectancy < MIN_STRESSED_EXPECTANCY_PCT:
            reasons.append(
                f"Doubling spread/slippage collapses expectancy to {stressed_expectancy:.4f}% — "
                "not robust to a realistic cost-sensitivity stress test."
            )

    n_symbols = (report.get("dataset_summary") or {}).get("n_symbols_with_data", 0)
    if n_symbols < MIN_SYMBOLS_FOR_DIVERSITY:
        reasons.append(f"Only {n_symbols} symbol(s) contributed data to this horizon — cannot rule out single-asset dominance.")

    qualified = not reasons
    version_tag = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    model = ResearchModel(
        family=selected_family or "none",
        horizon=horizon,
        version=version_tag,
        state="HISTORICALLY_QUALIFIED" if qualified else "REJECTED_OVERFIT",
        rejection_reason="; ".join(reasons) if reasons else None,
        walk_forward_report={
            "folds": report.get("folds", []),
            "selected_family": selected_family,
            "selection_rationale": report.get("selection_rationale"),
            "deflated_sharpe_probability": report.get("deflated_sharpe_probability"),
            "n_trials_for_dsr": report.get("n_trials_for_dsr"),
        },
        holdout_report=holdout or {},
        stress_test_report=stress or {},
        leakage_checks=leakage,
        dataset_summary=report.get("dataset_summary", {}),
        qualified_at=datetime.now(timezone.utc) if qualified else None,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def retire_model(db: Session, research_model_id: int, reason: str) -> ResearchModel:
    """Operator-initiated retirement — the only other write path this
    module exposes. Never automatic."""
    model = db.query(ResearchModel).filter_by(id=research_model_id).one()
    model.state = "RETIRED"
    model.retired_at = datetime.now(timezone.utc)
    model.rejection_reason = f"Retired: {reason}"
    db.commit()
    db.refresh(model)
    return model
