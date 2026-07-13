"""Deterministic Signal Engine with explicit safety rules.

The LLM never touches this path (spec): statuses, levels, and
probabilities come from the deterministic scoring pipeline + these rules.
NO_TRADE beats a weak recommendation, and every rejection is explained —
`rejection_reasons` is part of the stored signal, not a log line.

Status ladder (subset active; position-lifecycle statuses REDUCE/EXIT/
POSITION_ACTIVE engage when live position tracking is wired to executions):
NO_TRADE < AVOID < WATCH < SETUP_FORMING < POSSIBLE_ENTRY.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models.signal import Signal, SignalEvent
from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import MarketDataProvider
from app.services.scoring.scorer import analyze_ticker

FEATURE_VERSION = "fv-1"

MAX_SPREAD_PCT = 12.0
MIN_LIQUIDITY = 25.0
MIN_DOLLAR_VOLUME = 10_000.0
MAX_MANIPULATION = 60.0
MIN_CONFIDENCE = 30.0
MIN_DATA_QUALITY = 40.0


@dataclass
class SafetyVerdict:
    passed: bool
    reasons: list[str]


def apply_safety_rules(a: StockAnalysis, tech: dict, indicators_warm: bool, provider_healthy: bool) -> SafetyVerdict:
    """Every rule cites its threshold AND the observed value (spec: the
    engine must explain every rejection)."""
    reasons: list[str] = []
    if a.data_mode == "unspecified":
        reasons.append("Data provenance is unspecified — refusing to signal on unlabeled data.")
    if not provider_healthy:
        reasons.append("Provider connection unhealthy/stale — no entry signals on stale data.")
    if not indicators_warm:
        reasons.append("Indicators not warmed up — insufficient lookback for a reliable read.")
    if tech["spread_pct"] > MAX_SPREAD_PCT:
        reasons.append(f"Spread {tech['spread_pct']:.1f}% exceeds the {MAX_SPREAD_PCT:.0f}% safety limit.")
    if a.liquidity_score < MIN_LIQUIDITY:
        reasons.append(f"Liquidity {a.liquidity_score:.0f}/100 below the {MIN_LIQUIDITY:.0f} threshold.")
    if tech["avg_dollar_volume_20d"] < MIN_DOLLAR_VOLUME:
        reasons.append(f"Avg dollar volume ${tech['avg_dollar_volume_20d']:,.0f}/day below ${MIN_DOLLAR_VOLUME:,.0f}.")
    if a.manipulation_risk > MAX_MANIPULATION:
        reasons.append(f"Manipulation risk {a.manipulation_risk:.0f}/100 exceeds the {MAX_MANIPULATION:.0f} limit.")
    if a.confidence_score < MIN_CONFIDENCE:
        reasons.append(f"Model confidence {a.confidence_score:.0f}/100 below the {MIN_CONFIDENCE:.0f} floor.")
    return SafetyVerdict(passed=not reasons, reasons=reasons)


def _status_for(a: StockAnalysis, safety: SafetyVerdict) -> str:
    if a.manipulation_risk >= 75:
        return "AVOID"
    if not safety.passed:
        return "NO_TRADE"
    primary_p10 = next(
        (p.prob_up_10 for p in a.probability_matrix if p.horizon_days == a.estimated_holding_period_days),
        a.probability_matrix[0].prob_up_10,
    )
    if a.overall_ai_score >= 55 and primary_p10 >= 0.35 and a.expected_risk_reward >= 1.5:
        return "POSSIBLE_ENTRY"
    if a.overall_ai_score >= 45 and primary_p10 >= 0.25:
        return "SETUP_FORMING"
    if a.overall_ai_score >= 30:
        return "WATCH"
    return "NO_TRADE"


def evaluate_signal(
    symbol: str,
    provider: MarketDataProvider,
    db: Session,
    indicators_warm: bool = True,
    provider_healthy: bool = True,
) -> Signal:
    """Evaluate and persist. If the latest stored signal has the same
    status, only a SignalEvent is appended (heartbeat); a status change
    writes a new immutable Signal + supersession events.
    """
    from app.services.features import technical

    a = analyze_ticker(symbol, provider=provider)
    df = provider.get_ohlcv(symbol, lookback_days=120)
    tech = technical.compute_all_technical_features(df)
    safety = apply_safety_rules(a, tech, indicators_warm, provider_healthy)
    status = _status_for(a, safety)

    data_quality = min(a.confidence_score + 20, 100.0) if a.data_mode != "unspecified" else 0.0
    primary = next(
        (p for p in a.probability_matrix if p.horizon_days == a.estimated_holding_period_days),
        a.probability_matrix[0],
    )
    bullish = [f.label for f in a.top_factors if f.direction == "bullish"]
    bearish = [f.label for f in a.top_factors if f.direction == "bearish"] + [f.reason for f in a.manipulation_flags[:2]]

    actionable = status in ("POSSIBLE_ENTRY", "SETUP_FORMING")
    signal = Signal(
        ticker_symbol=a.ticker, status=status,
        ideal_entry=a.ideal_entry_price if actionable else None,
        entry_zone_low=a.suggested_entry_zone_low if actionable else None,
        entry_zone_high=a.suggested_entry_zone_high if actionable else None,
        stop_loss=a.stop_loss if actionable else None,
        targets=[a.take_profit_1, a.take_profit_2, a.take_profit_3] if actionable else [],
        holding_period_days=a.estimated_holding_period_days,
        risk_reward=a.expected_risk_reward,
        calibrated_probability=primary.prob_up_10,
        confidence=a.confidence_score,
        technical_score=a.technical_score,
        liquidity_score=a.liquidity_score,
        manipulation_risk=a.manipulation_risk,
        dilution_risk_pct=None,  # populated from EDGAR overlay when present in fundamentals
        data_quality_score=data_quality,
        bullish_reasons=bullish,
        bearish_reasons=bearish,
        invalidation_conditions=[
            f"Close below stop (${a.stop_loss:.4f})" if actionable else "N/A — no active setup",
            "New dilutive filing or reverse split",
            "Manipulation flag activation",
        ],
        rejection_reasons=safety.reasons,
        data_source=a.data_source, data_mode=a.data_mode,
        model_version="champion-latest", feature_version=FEATURE_VERSION,
    )

    latest = (
        db.query(Signal)
        .filter_by(ticker_symbol=a.ticker)
        .order_by(Signal.created_at.desc(), Signal.id.desc())
        .first()
    )
    if latest is not None and latest.status == status:
        db.add(SignalEvent(signal_id=latest.id, event_type="reaffirmed",
                           from_status=status, to_status=status,
                           reason="Re-evaluation produced the same status"))
        db.commit()
        return latest

    db.add(signal)
    db.flush()
    db.add(SignalEvent(signal_id=signal.id, event_type="created", to_status=status,
                       reason=safety.reasons[0] if safety.reasons else (bullish[0] if bullish else "evaluation")))
    if latest is not None:
        db.add(SignalEvent(signal_id=latest.id, event_type="superseded",
                           from_status=latest.status, to_status=status,
                           reason=f"Superseded by signal for new status {status}"))
    db.commit()
    db.refresh(signal)
    return signal
