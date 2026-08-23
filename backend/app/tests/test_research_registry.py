"""services/research/registry.py — the Phase 5 qualification gate. Proves
every rejection path fires for exactly the condition it names, and that
a genuinely clean report is the only way to reach HISTORICALLY_QUALIFIED."""
from app.services.research.registry import (
    MAX_ACCEPTABLE_CALIBRATION_GAP,
    MAX_ACCEPTABLE_DRAWDOWN_PCT,
    MIN_HOLDOUT_TRADES,
    MIN_STRESSED_EXPECTANCY_PCT,
    qualify_candidate,
    retire_model,
)


def _clean_report(**overrides) -> dict:
    holdout_result = {
        "n_trades": MIN_HOLDOUT_TRADES + 5,
        "expectancy_pct": 0.5,
        "max_drawdown_pct": MAX_ACCEPTABLE_DRAWDOWN_PCT + 1,  # less negative -> inside the mandate
        "buy_calibration_gap": MAX_ACCEPTABLE_CALIBRATION_GAP - 0.05,
    }
    report = {
        "leakage_checks": {"all_passed": True},
        "selected_family": "lightgbm",
        "holdout": {"family": "lightgbm", "result": holdout_result},
        "stress_test": {"doubled_costs": {"expectancy_pct": MIN_STRESSED_EXPECTANCY_PCT + 0.1}},
        "dataset_summary": {"n_symbols_with_data": 5},
        "folds": [],
        "selection_rationale": "test",
        "deflated_sharpe_probability": 0.8,
        "n_trials_for_dsr": 5,
    }
    report.update(overrides)
    return report


def test_a_genuinely_clean_report_qualifies(db_session):
    model = qualify_candidate(db_session, "1d", _clean_report())
    assert model.state == "HISTORICALLY_QUALIFIED"
    assert model.rejection_reason is None
    assert model.qualified_at is not None


def test_a_failed_leakage_check_rejects(db_session):
    report = _clean_report(leakage_checks={"all_passed": False, "every_sample_exit_after_entry": False})
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "leakage" in model.rejection_reason.lower()


def test_no_selected_family_rejects(db_session):
    report = _clean_report(selected_family=None, holdout=None, note="not enough data")
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert model.family == "none"


def test_too_few_holdout_trades_rejects(db_session):
    report = _clean_report()
    report["holdout"]["result"]["n_trades"] = MIN_HOLDOUT_TRADES - 1
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "trades" in model.rejection_reason.lower()


def test_non_positive_holdout_expectancy_rejects(db_session):
    report = _clean_report()
    report["holdout"]["result"]["expectancy_pct"] = -0.01
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "expectancy" in model.rejection_reason.lower()


def test_excessive_drawdown_rejects(db_session):
    report = _clean_report()
    report["holdout"]["result"]["max_drawdown_pct"] = MAX_ACCEPTABLE_DRAWDOWN_PCT - 5  # more negative -> worse
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "drawdown" in model.rejection_reason.lower()


def test_poor_calibration_rejects(db_session):
    report = _clean_report()
    report["holdout"]["result"]["buy_calibration_gap"] = MAX_ACCEPTABLE_CALIBRATION_GAP + 0.2
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "calibration" in model.rejection_reason.lower()


def test_stress_test_collapse_rejects(db_session):
    report = _clean_report()
    report["stress_test"]["doubled_costs"]["expectancy_pct"] = MIN_STRESSED_EXPECTANCY_PCT - 1
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "stress" in model.rejection_reason.lower()


def test_single_asset_dominance_rejects(db_session):
    report = _clean_report()
    report["dataset_summary"]["n_symbols_with_data"] = 1
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "symbol" in model.rejection_reason.lower()


def test_multiple_failures_are_all_recorded_not_just_the_first(db_session):
    report = _clean_report()
    report["holdout"]["result"]["expectancy_pct"] = -1.0
    report["dataset_summary"]["n_symbols_with_data"] = 1
    model = qualify_candidate(db_session, "1d", report)
    assert model.state == "REJECTED_OVERFIT"
    assert "expectancy" in model.rejection_reason.lower()
    assert "symbol" in model.rejection_reason.lower()


def test_qualification_never_writes_to_shadow_or_live_model_tables(db_session):
    from app.db.models.model_version import ModelVersion
    from app.db.models.shadow_position import ShadowPosition

    qualify_candidate(db_session, "1d", _clean_report())
    assert db_session.query(ShadowPosition).count() == 0
    assert db_session.query(ModelVersion).count() == 0


def test_retire_model_sets_retired_state_and_timestamp(db_session):
    model = qualify_candidate(db_session, "1d", _clean_report())
    retired = retire_model(db_session, model.id, "superseded by a newer candidate")
    assert retired.state == "RETIRED"
    assert retired.retired_at is not None
    assert "superseded" in retired.rejection_reason
