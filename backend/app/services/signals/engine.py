"""Deterministic Signal Engine with explicit safety rules.

The LLM never touches this path (spec): statuses, levels, and
probabilities come from the deterministic scoring pipeline + these rules.
NO_TRADE beats a weak recommendation, and every rejection is explained —
`rejection_reasons` is part of the stored signal, not a log line.

Status ladder (subset active; position-lifecycle statuses REDUCE/EXIT/
POSITION_ACTIVE engage when live position tracking is wired to executions):
NO_TRADE < AVOID < WATCH < SETUP_FORMING < POSSIBLE_ENTRY.

**Timeframe scoping (honesty note):** the ML ensemble/probability-matrix/
trade-plan prices in `StockAnalysis` (via `analyze_ticker`) are and remain
a daily-bar read — the model is trained on daily features and rebuilding
that pipeline per intraday timeframe is out of scope here. What *does*
change with `timeframe` is the technical/pattern/support-resistance/regime
read used for the safety gate and the AI Signals indicator's supporting
evidence: intraday timeframes read real bars accumulated by the streaming
service (`services/streaming/service.py`), never fabricated history.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models.signal import Signal, SignalEvent
from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import MarketDataProvider
from app.services.risk.engine import evaluate_risk
from app.services.risk.policy import RiskPolicy
from app.services.scoring.scorer import analyze_ticker

FEATURE_VERSION = "fv-1"

# The spread/liquidity/dollar-volume/manipulation/confidence/min-bars
# thresholds this module used to hardcode locally now live in RiskPolicy
# (services/risk/policy.py), shared with the scanner
# (services/scanner/multi_asset.py) — apply_safety_rules() and
# evaluate_signal() always read the live policy, never a local constant.
MIN_DATA_QUALITY = 40.0

_INTRADAY_TIMEFRAMES = {"1m", "5m", "15m", "1H"}
_RESAMPLE_RULE = {"5m": "5min", "15m": "15min", "1H": "1h", "1W": "1W", "1M": "1MS"}
# One fixed lookback for every daily+ request (not per-timeframe): the mock
# provider's synthetic generator regenerates its whole random walk from
# scratch for each distinct lookback_days value, so requesting a different
# number of days per timeframe would show a *different fabricated price
# path* per button, not a coarser view of the same one. Fetching the same
# base series once and slicing/resampling views from it in Python keeps
# every timeframe honestly showing the same underlying price history.
_BASE_DAILY_LOOKBACK = 2000
_DAILY_TAIL_BARS = {"1D": 250, "1Y": 260, "1W": 156, "1M": 60}  # bars kept AFTER any resample

_SIGNAL_TYPE_FOR_STATUS = {
    "POSSIBLE_ENTRY": "BUY",
    "SETUP_FORMING": "BUY",
    "AVOID": "SELL",
    "REDUCE": "SELL",
    "EXIT": "SELL",
    "SIGNAL_INVALIDATED": "SELL",
    "WATCH": "HOLD",
    "NO_TRADE": "HOLD",
    "POSITION_ACTIVE": "HOLD",
}


def _bars_to_df(bars: list) -> pd.DataFrame:
    """Bar objects from the streaming service -> an OHLCV DataFrame in the
    same shape every provider's get_ohlcv() returns."""
    from datetime import datetime, timezone

    if not bars:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    idx = pd.DatetimeIndex(
        [datetime.fromtimestamp(b.start_ts, tz=timezone.utc) for b in bars], name="ts"
    )
    return pd.DataFrame(
        {
            "open": [b.open for b in bars],
            "high": [b.high for b in bars],
            "low": [b.low for b in bars],
            "close": [b.close for b in bars],
            "volume": [b.volume for b in bars],
        },
        index=idx,
    )


def _resample_ohlcv(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    if df.empty:
        return df
    resampled = df.resample(rule).agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    return resampled.dropna(subset=["open"])


def bars_for_timeframe(symbol: str, provider: MarketDataProvider, timeframe: str) -> pd.DataFrame:
    """The single timeframe -> real-bars mapping shared by the signal
    engine and the /stocks/{symbol}/candles endpoint. Intraday timeframes
    never call the provider — they read whatever the streaming service has
    actually accumulated (real trades, resampled up), which may be sparse
    or empty for a symbol that was never subscribed. Daily+ timeframes are
    always real provider history; 1W/1M are a lossless resample of it.
    """
    timeframe = (timeframe or "1D").upper() if timeframe not in _INTRADAY_TIMEFRAMES else timeframe

    if timeframe in _INTRADAY_TIMEFRAMES:
        from app.services.streaming.service import get_stream_service

        bars = get_stream_service().recent_bars(symbol, limit=500)
        df = _bars_to_df(bars)
        if df.empty or timeframe == "1m":
            return df
        return _resample_ohlcv(df, _RESAMPLE_RULE[timeframe])

    df = provider.get_ohlcv(symbol, lookback_days=_BASE_DAILY_LOOKBACK)
    if timeframe in ("1W", "1M"):
        df = _resample_ohlcv(df, _RESAMPLE_RULE[timeframe])
    elif timeframe == "ALL":
        return df
    return df.tail(_DAILY_TAIL_BARS.get(timeframe, 250))


def candle_provenance(symbol: str, provider: MarketDataProvider, timeframe: str) -> tuple[str, str]:
    """(data_source, data_mode) for the /candles endpoint's honesty badge.
    Intraday timeframes are served by the streaming service, which may be a
    different vendor/mode than the REST provider (e.g. synthetic ticks
    while REST daily history is real) — never assume they match."""
    if timeframe in _INTRADAY_TIMEFRAMES:
        from app.services.streaming.service import get_stream_service

        bars = get_stream_service().recent_bars(symbol, limit=1)
        if not bars:
            return "stream", "unspecified"
        return bars[-1].provider, bars[-1].data_mode
    return provider.name, getattr(provider, "data_mode", "unspecified")


def multi_timeframe_agreement(df: pd.DataFrame) -> bool | None:
    """Compares the series' own short-term trend direction against a
    coarser resample of the *same* real data (every 4th bar, approximating
    a ~4x-larger timeframe) — never a second fetch, never invented. None
    when there isn't enough history to form a meaningful coarse read."""
    from app.services.features import technical

    if len(df) < 40:
        return None
    fast_slope = float(technical.ema(df["close"], 9).diff().tail(5).mean())
    coarse = df.iloc[::4]
    if len(coarse) < 10:
        return None
    coarse_slope = float(technical.ema(coarse["close"], 9).diff().tail(5).mean())
    return (fast_slope > 0) == (coarse_slope > 0)


def _compose_explanation(
    signal_type: str, status: str, bullish: list[str], bearish: list[str],
    pattern_names: list[str], regime_label: str | None, mtf_agree: bool | None, rejections: list[str],
) -> str:
    if signal_type == "INSUFFICIENT_DATA":
        return "Not enough market data on this timeframe yet to produce a reliable AI signal."
    parts = [f"{signal_type} — {status.replace('_', ' ').title()}."]
    if regime_label:
        parts.append(f"Market regime: {regime_label.replace('_', ' ')}.")
    if pattern_names:
        parts.append(f"Recent candlestick pattern: {pattern_names[0].replace('_', ' ')}.")
    if mtf_agree is not None:
        parts.append("Confirmed on a coarser timeframe." if mtf_agree else "Not confirmed on a coarser timeframe — lower conviction.")
    if bullish:
        parts.append("Bullish: " + "; ".join(bullish[:3]) + ".")
    if bearish:
        parts.append("Bearish: " + "; ".join(bearish[:3]) + ".")
    if rejections:
        parts.append("Rejected: " + "; ".join(rejections[:2]) + ".")
    return " ".join(parts)


@dataclass
class SafetyVerdict:
    passed: bool
    reasons: list[str]


def apply_safety_rules(
    a: StockAnalysis,
    tech: dict,
    indicators_warm: bool,
    provider_healthy: bool,
    policy: RiskPolicy | None = None,
) -> SafetyVerdict:
    """Every rule cites its threshold AND the observed value (spec: the
    engine must explain every rejection). Thresholds come from the shared
    RiskPolicy (defaults to the live one), not locally hardcoded — this is
    the same policy the scanner (services/scanner/multi_asset.py) applies,
    so a ticker can no longer look tradeable here while the scanner would
    reject it, or vice versa."""
    policy = policy or RiskPolicy.from_settings()
    reasons: list[str] = []
    if a.data_mode == "unspecified":
        reasons.append("Data provenance is unspecified — refusing to signal on unlabeled data.")
    if not provider_healthy:
        reasons.append("Provider connection unhealthy/stale — no entry signals on stale data.")
    if not indicators_warm:
        reasons.append("Indicators not warmed up — insufficient lookback for a reliable read.")
    if tech["spread_pct"] > policy.max_spread_pct:
        reasons.append(f"Spread {tech['spread_pct']:.1f}% exceeds the {policy.max_spread_pct:.0f}% safety limit.")
    if a.liquidity_score < policy.min_liquidity_score:
        reasons.append(f"Liquidity {a.liquidity_score:.0f}/100 below the {policy.min_liquidity_score:.0f} threshold.")
    if tech["avg_dollar_volume_20d"] < policy.min_dollar_volume:
        reasons.append(f"Avg dollar volume ${tech['avg_dollar_volume_20d']:,.0f}/day below ${policy.min_dollar_volume:,.0f}.")
    if a.manipulation_risk > policy.max_manipulation_risk:
        reasons.append(f"Manipulation risk {a.manipulation_risk:.0f}/100 exceeds the {policy.max_manipulation_risk:.0f} limit.")
    if a.confidence_score < policy.min_signal_confidence_pct:
        reasons.append(f"Model confidence {a.confidence_score:.0f}/100 below the {policy.min_signal_confidence_pct:.0f} floor.")
    return SafetyVerdict(passed=not reasons, reasons=reasons)


def _status_for(
    a: StockAnalysis, safety: SafetyVerdict, policy: RiskPolicy, db: Session | None = None
) -> tuple[str, list[str]]:
    """Returns (status, extra_reasons) — extra_reasons carries the
    deterministic Risk Engine's own rejection text on the one path where it
    actually changes the outcome (a setup strong enough by score/probability
    to reach POSSIBLE_ENTRY, but rejected by evaluate_risk()'s confidence/
    reward:risk floor — the SAME check + SAME thresholds
    services/scanner/multi_asset.py applies), so the explanation stays
    honest about why a strong-looking setup didn't reach the top tier."""
    if a.manipulation_risk >= 75:
        return "AVOID", []
    if not safety.passed:
        return "NO_TRADE", []
    primary_p10 = next(
        (p.prob_up_10 for p in a.probability_matrix if p.horizon_days == a.estimated_holding_period_days),
        a.probability_matrix[0].prob_up_10,
    )
    if a.overall_ai_score >= 55 and primary_p10 >= 0.35:
        # Score/probability alone would reach the top tier — but POSSIBLE_ENTRY
        # additionally requires clearing the same deterministic Risk Engine
        # gate (confidence + reward:risk) the scanner enforces, replacing
        # this engine's own former, looser ad-hoc reward:risk check.
        risk_verdict = evaluate_risk(a.confidence_score, a.expected_risk_reward, db=db)
        if risk_verdict.passed:
            return "POSSIBLE_ENTRY", []
        if a.overall_ai_score >= 45 and primary_p10 >= 0.25:
            return "SETUP_FORMING", risk_verdict.reasons
        return "WATCH", risk_verdict.reasons
    if a.overall_ai_score >= 45 and primary_p10 >= 0.25:
        return "SETUP_FORMING", []
    if a.overall_ai_score >= 30:
        return "WATCH", []
    return "NO_TRADE", []


def _latest_for(db: Session, ticker: str, timeframe: str) -> Signal | None:
    return (
        db.query(Signal)
        .filter_by(ticker_symbol=ticker, timeframe=timeframe)
        .order_by(Signal.created_at.desc(), Signal.id.desc())
        .first()
    )


def _persist(db: Session, latest: Signal | None, signal: Signal, status: str, reason: str) -> Signal:
    if latest is not None and latest.status == status and latest.signal_type == signal.signal_type:
        db.add(SignalEvent(signal_id=latest.id, event_type="reaffirmed",
                           from_status=status, to_status=status,
                           reason="Re-evaluation produced the same status"))
        db.commit()
        return latest

    db.add(signal)
    db.flush()
    db.add(SignalEvent(signal_id=signal.id, event_type="created", to_status=status, reason=reason))
    if latest is not None:
        db.add(SignalEvent(signal_id=latest.id, event_type="superseded",
                           from_status=latest.status, to_status=status,
                           reason=f"Superseded by signal for new status {status}"))
    db.commit()
    db.refresh(signal)
    return signal


def evaluate_signal(
    symbol: str,
    provider: MarketDataProvider,
    db: Session,
    timeframe: str = "1D",
    indicators_warm: bool = True,
    provider_healthy: bool = True,
) -> Signal:
    """Evaluate and persist. If the latest stored signal *for this
    timeframe* has the same status, only a SignalEvent is appended
    (heartbeat); a status change writes a new immutable Signal +
    supersession events. Each timeframe keeps its own signal history, so
    the chart's marker trail for "1H" never mixes in daily evaluations.

    The ML-driven score/probabilities/trade-plan prices (`analyze_ticker`)
    are always the platform's one daily read — see the module docstring.
    What varies by `timeframe` is the technical/pattern/support-resistance/
    regime evidence layered on top of it.
    """
    from app.services.features import levels, patterns, regime, technical

    policy = RiskPolicy.from_settings()
    a = analyze_ticker(symbol, provider=provider)
    ticker = a.ticker
    df = bars_for_timeframe(ticker, provider, timeframe)
    tf_label = timeframe if timeframe in _INTRADAY_TIMEFRAMES else timeframe.upper()

    if len(df) < policy.min_bars_for_signal:
        latest = _latest_for(db, ticker, tf_label)
        insufficient = Signal(
            ticker_symbol=ticker, status="NO_TRADE", timeframe=tf_label, signal_type="INSUFFICIENT_DATA",
            confidence=0.0, data_quality_score=0.0,
            bullish_reasons=[], bearish_reasons=[], invalidation_conditions=[],
            rejection_reasons=[f"Only {len(df)} bars available on {tf_label} — need at least {policy.min_bars_for_signal}."],
            explanation=_compose_explanation("INSUFFICIENT_DATA", "NO_TRADE", [], [], [], None, None, []),
            data_source=a.data_source, data_mode=a.data_mode,
            model_version="champion-latest", feature_version=FEATURE_VERSION, risk_policy_version=policy.version,
        )
        return _persist(db, latest, insufficient, "NO_TRADE", "Insufficient bars for this timeframe")

    tech = technical.compute_all_technical_features(df)
    safety = apply_safety_rules(a, tech, indicators_warm, provider_healthy, policy)
    status, risk_gate_reasons = _status_for(a, safety, policy, db=db)
    if risk_gate_reasons:
        safety = SafetyVerdict(passed=safety.passed, reasons=[*safety.reasons, *risk_gate_reasons])
    signal_type = _SIGNAL_TYPE_FOR_STATUS.get(status, "HOLD")

    pattern_matches = patterns.detect_patterns(df, lookback=5)
    pattern_names = [m.name for m in pattern_matches]
    try:
        regime_result = regime.detect_regime(df)
    except ValueError:
        regime_result = None
    mtf_agree = multi_timeframe_agreement(df)
    sr_levels = levels.detect_support_resistance(df)

    data_quality = min(a.confidence_score + 20, 100.0) if a.data_mode != "unspecified" else 0.0
    primary = next(
        (p for p in a.probability_matrix if p.horizon_days == a.estimated_holding_period_days),
        a.probability_matrix[0],
    )
    bullish = [f.label for f in a.top_factors if f.direction == "bullish"]
    bearish = [f.label for f in a.top_factors if f.direction == "bearish"] + [f.reason for f in a.manipulation_flags[:2]]
    for m in pattern_matches[:2]:
        label = f"Pattern: {m.name.replace('_', ' ')} ({m.reason})"
        (bullish if m.direction == "bullish" else bearish if m.direction == "bearish" else bullish).append(label)
    if regime_result:
        (bullish if regime_result.regime == "trending_up" else bearish if regime_result.regime == "trending_down" else bullish).append(
            f"Regime: {regime_result.regime.replace('_', ' ')} ({regime_result.reason})"
        )
    near_support = [lv for lv in sr_levels if lv.kind == "support" and abs(tech["price"] / lv.price - 1) < 0.02]
    near_resistance = [lv for lv in sr_levels if lv.kind == "resistance" and abs(tech["price"] / lv.price - 1) < 0.02]
    if near_support:
        bullish.append(f"Price near support ${near_support[0].price:.4f} ({near_support[0].touches} touches)")
    if near_resistance:
        bearish.append(f"Price near resistance ${near_resistance[0].price:.4f} ({near_resistance[0].touches} touches)")

    explanation = _compose_explanation(signal_type, status, bullish, bearish, pattern_names, regime_result.regime if regime_result else None, mtf_agree, safety.reasons)

    actionable = status in ("POSSIBLE_ENTRY", "SETUP_FORMING")
    signal = Signal(
        ticker_symbol=ticker, status=status, timeframe=tf_label, signal_type=signal_type,
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
        explanation=explanation,
        market_regime=regime_result.regime if regime_result else None,
        multi_timeframe_agreement=mtf_agree,
        patterns_detected=pattern_names,
        data_source=a.data_source, data_mode=a.data_mode,
        model_version="champion-latest", feature_version=FEATURE_VERSION, risk_policy_version=policy.version,
    )

    latest = _latest_for(db, ticker, tf_label)
    reason = safety.reasons[0] if safety.reasons else (bullish[0] if bullish else "evaluation")
    return _persist(db, latest, signal, status, reason)
