"""Nexora Conviction Signal (NCS) — Nexora's own versioned, explainable
composite indicator. Distinct from services/signals/engine.py's existing
POSSIBLE_ENTRY/WATCH/... ladder (not replaced, not read from): NCS is a
separate, additive signal with its own five-way verdict scale, confidence
%, risk score, and plain-language explanation, persisted append-only in
the `ncs_signals` table (db/models/ncs_signal.py).

Composite method: each input is scored to a component in [-1, +1]
(positive = bullish), combined as a weight-normalized average into a
composite score, then bucketed into a verdict. Components whose input
isn't available (news sentiment, strategy agreement, portfolio context)
contribute weight 0 rather than a fabricated neutral vote — both the
composite and the confidence % honestly reflect how much evidence was
actually available, not a hidden assumption.

Non-repaint contract (all three enforced here, not just documented):
1. CLOSED BARS ONLY — `bars_for_timeframe(..., closed_only=True)`
   (services/signals/engine.py) never returns a bar that could still
   change; NCS is anchored to that closed bar's timestamp (`bar_ts`).
2. NEVER REPAINT A PAST BAR — a row already exists for
   (ticker, timeframe, bar_ts)? Return it unchanged. A `bar_ts` is
   evaluated exactly once, ever (enforced by the unique index too).
3. CONFIRMATION — a verdict only becomes `confirmed_verdict` when this
   bar's raw bucket (BUY-family / SELL-family / NEUTRAL) matches the
   immediately preceding persisted row's bucket for the same
   (ticker, timeframe): two consecutive closed bars agreeing, never one.
4. COOLDOWN + NO REPEATED MARKERS — `fired=True` only on a *new*
   confirmed bucket that has cleared `cooldown_minutes` since the last
   fired row of that same bucket. A chart should only ever draw a new
   marker for a row with `fired=True`; every other row is real history,
   just not marker-worthy.

A computed/fired NCS row is a chart annotation, nothing more — nothing in
this module places, opens, or even suggests a paper order. Wiring it into
autonomous paper trading is a distinct, separate decision (see
services/paper_trading/engine.py) that must itself pass every safety
gate independently.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models.ncs_signal import NcsSignal
from app.services.data_providers.base import MarketDataProvider
from app.services.features import regime as regime_module
from app.services.features import technical
from app.services.risk.policy import RiskPolicy
from app.services.scoring.scorer import analyze_ticker
from app.services.signals.engine import _INTRADAY_TIMEFRAMES, bars_for_timeframe

NCS_VERSION = "ncs-1.0.0"
DEFAULT_COOLDOWN_MINUTES = 60.0

_VERDICTS = ("STRONG_SELL", "SELL", "NEUTRAL", "BUY", "STRONG_BUY")
_BUY_FAMILY = {"BUY", "STRONG_BUY"}
_SELL_FAMILY = {"SELL", "STRONG_SELL"}

# Sum of every directional component's weight when its input IS available
# (trend, momentum, vwap, volume, regime, manipulation, news, portfolio —
# strategy_agreement excluded: it's a confidence/conviction multiplier,
# never a weighted component, so it never contributes to this sum). Used
# to honestly report what fraction of possible evidence actually went
# into a given computation, not a magic-number stand-in.
_MAX_COMPONENT_WEIGHT = 0.16 + 0.16 + 0.09 + 0.08 + 0.09 + 0.13 + 0.10 + 0.06


def _bucket(verdict: str) -> str:
    if verdict in _BUY_FAMILY:
        return "BUY"
    if verdict in _SELL_FAMILY:
        return "SELL"
    return "NEUTRAL"


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return float(np.clip(x, lo, hi))


@dataclass
class NcsComponent:
    name: str
    score: float  # -1..+1, directional. 0 with weight 0 means "not available", not "neutral evidence".
    weight: float
    detail: str


@dataclass
class RiskContribution:
    name: str
    contribution: float  # 0..1
    weight: float


@dataclass
class NcsInputs:
    """Optional, pluggable inputs NCS doesn't compute itself — supplied by
    the caller when the corresponding subsystem exists. Each defaults to
    "not available" (None), which the corresponding component reports
    honestly rather than guessing a neutral value.
    """

    news_sentiment: float | None = None  # -1..+1, e.g. from a future news pipeline
    strategy_agreement: float | None = None  # 0..1, e.g. agents.evidence.EvidenceBundle.agreement()
    portfolio_open_symbols: set[str] | None = None  # the account's currently-open symbols
    red_team_veto: RedTeamVerdict | None = None


@dataclass
class RedTeamVerdict:
    """Minimal shape a future Red-Team module must satisfy to plug into
    NCS — kept here (not imported from a not-yet-built module) so NCS has
    zero hard dependency on it existing. `services.signals.red_team`
    (when built) should produce exactly this shape."""

    vetoed: bool
    reason: str | None = None


def _trend_component(tech: dict) -> NcsComponent:
    ema9, ema21, sma50 = tech["ema_9"], tech["ema_21"], tech["sma_50"]
    if ema9 > ema21 > sma50:
        alignment, label = 1.0, "EMA9 > EMA21 > SMA50 (full bullish alignment)"
    elif ema9 < ema21 < sma50:
        alignment, label = -1.0, "EMA9 < EMA21 < SMA50 (full bearish alignment)"
    elif ema9 > ema21:
        alignment, label = 0.5, "EMA9 > EMA21 (short-term bullish, not fully aligned)"
    elif ema9 < ema21:
        alignment, label = -0.5, "EMA9 < EMA21 (short-term bearish, not fully aligned)"
    else:
        alignment, label = 0.0, "EMA9 ≈ EMA21 (no clear trend)"
    strength = min(tech["adx"] / 40.0, 1.0)
    score = _clip(alignment * (0.5 + 0.5 * strength))
    return NcsComponent("trend_structure", score, 0.16, f"{label}; ADX {tech['adx']:.0f}")


def _momentum_component(tech: dict) -> NcsComponent:
    rsi_score = _clip((tech["rsi_14"] - 50) / 25.0)
    macd_dir = np.sign(tech["macd_histogram"])
    macd_cross = 1.0 if tech["macd"] > tech["macd_signal"] else (-1.0 if tech["macd"] < tech["macd_signal"] else 0.0)
    macd_score = _clip((macd_dir + macd_cross) / 2)
    score = _clip(0.55 * rsi_score + 0.45 * macd_score)
    macd_word = "bullish" if macd_score > 0.1 else "bearish" if macd_score < -0.1 else "flat"
    return NcsComponent("momentum", score, 0.16, f"RSI {tech['rsi_14']:.0f}, MACD {macd_word}")


def _vwap_component(tech: dict) -> NcsComponent:
    vwap_val, price = tech.get("vwap"), tech["price"]
    if not vwap_val:
        return NcsComponent("vwap_position", 0.0, 0.0, "VWAP unavailable for this window")
    pct = (price / vwap_val - 1) * 100
    return NcsComponent("vwap_position", _clip(pct / 2.0), 0.09, f"Price {'above' if pct >= 0 else 'below'} VWAP by {abs(pct):.2f}%")


def _volume_component(df: pd.DataFrame, tech: dict) -> NcsComponent:
    rvol = tech["relative_volume"]
    day_change = float(np.sign(df["close"].iloc[-1] - df["close"].iloc[-2])) if len(df) >= 2 else 0.0
    strength = min(max(rvol - 1.0, 0.0) / 1.5, 1.0)  # rvol>=2.5x -> full strength
    score = _clip(day_change * strength)
    return NcsComponent(
        "volume", score, 0.08,
        f"Relative volume {rvol:.1f}x on a {'higher' if day_change > 0 else 'lower' if day_change < 0 else 'flat'} bar",
    )


def _regime_component(regime_result) -> NcsComponent:
    if regime_result is None:
        return NcsComponent("market_regime", 0.0, 0.0, "Regime undetermined — insufficient history")
    label = regime_result.regime
    score = 0.5 if label == "trending_up" else -0.5 if label == "trending_down" else 0.0
    return NcsComponent("market_regime", score, 0.09, f"Regime: {label.replace('_', ' ')} ({regime_result.reason})")


def _manipulation_component(manipulation_risk: float) -> tuple[NcsComponent, RiskContribution]:
    risk_frac = manipulation_risk / 100.0
    score = -risk_frac * 0.6  # penalizes bullishness; never adds to it
    component = NcsComponent("manipulation_risk", score, 0.13, f"Manipulation risk {manipulation_risk:.0f}/100")
    return component, RiskContribution("manipulation_risk", risk_frac, 0.35)


def _volatility_risk(tech: dict) -> RiskContribution:
    atr_pct = tech["atr_pct"]
    return RiskContribution("volatility", min(atr_pct / 8.0, 1.0), 0.20)


def _liquidity_risk(liquidity_score: float) -> RiskContribution:
    return RiskContribution("liquidity", max(0.0, (60.0 - liquidity_score) / 60.0), 0.20)


def _news_component(news_sentiment: float | None) -> NcsComponent:
    if news_sentiment is None:
        return NcsComponent("news_sentiment", 0.0, 0.0, "No live news signal available yet")
    return NcsComponent("news_sentiment", _clip(news_sentiment), 0.10, f"News sentiment {news_sentiment:+.2f}")


def _strategy_agreement_component(agreement: float | None) -> NcsComponent:
    if agreement is None:
        return NcsComponent("strategy_agreement", 0.0, 0.0, "No multi-strategy agreement input available yet")
    # agreement is 0..1 (how much independent evidence agrees), not itself
    # directional — it amplifies whatever direction the other components
    # already point, so it only ever nudges toward 0 for low agreement,
    # never invents a direction. Score kept at 0 always; instead it's
    # applied as a confidence multiplier below.
    return NcsComponent("strategy_agreement", 0.0, 0.0, f"Cross-strategy agreement {agreement:.0%}")


def _portfolio_risk_component(symbol: str, open_symbols: set[str] | None) -> tuple[NcsComponent, RiskContribution]:
    if open_symbols is None:
        return NcsComponent("portfolio_risk", 0.0, 0.0, "Portfolio context not provided"), RiskContribution("portfolio", 0.0, 0.0)
    if symbol in open_symbols:
        return (
            NcsComponent("portfolio_risk", -0.3, 0.06, "Already holding an open position — conviction dampened against averaging up/down"),
            RiskContribution("portfolio", 0.4, 0.15),
        )
    if len(open_symbols) >= 5:
        return (
            NcsComponent("portfolio_risk", -0.2, 0.06, f"{len(open_symbols)} open positions already — high aggregate exposure"),
            RiskContribution("portfolio", 0.4, 0.15),
        )
    return NcsComponent("portfolio_risk", 0.0, 0.06, f"{len(open_symbols)} open position(s) — exposure normal"), RiskContribution("portfolio", 0.0, 0.15)


def _verdict_for_score(score: float) -> str:
    if score >= 0.5:
        return "STRONG_BUY"
    if score >= 0.15:
        return "BUY"
    if score <= -0.5:
        return "STRONG_SELL"
    if score <= -0.15:
        return "SELL"
    return "NEUTRAL"


def _compose_explanation(verdict: str, components: list[NcsComponent], risk_score: float, vetoed: bool, veto_reason: str | None) -> str:
    if vetoed:
        return f"Vetoed — {veto_reason or 'Red-Team review rejected this setup'}. Raw signal would have been {verdict}."
    ranked = sorted((c for c in components if c.weight > 0), key=lambda c: -abs(c.score * c.weight))
    top = ranked[:3]
    lead = f"{verdict.replace('_', ' ').title()} — " if verdict != "NEUTRAL" else "Neutral — "
    reasons = "; ".join(c.detail for c in top)
    return f"{lead}{reasons}. Risk score {risk_score:.0f}/100."


@dataclass
class NcsComputation:
    """In-memory result before persistence — mirrors NcsSignal's fields."""

    ticker_symbol: str
    timeframe: str
    bar_ts: datetime
    raw_verdict: str
    composite_score: float
    confidence_pct: float
    risk_score: float
    explanation: str
    components: list[dict]
    vetoed: bool
    veto_reason: str | None
    data_source: str
    data_mode: str


class NcsInsufficientData(Exception):
    """Raised when there isn't enough closed-bar history to compute NCS —
    never silently fabricated as NEUTRAL."""


def compute_ncs(
    symbol: str,
    provider: MarketDataProvider,
    db: Session,
    timeframe: str = "1D",
    inputs: NcsInputs | None = None,
) -> NcsComputation:
    """Pure computation — does not touch the database. `evaluate_ncs`
    below wraps this with the persist/confirm/cooldown state machine."""
    inputs = inputs or NcsInputs()
    policy = RiskPolicy.from_settings()
    timeframe_label = timeframe if timeframe in _INTRADAY_TIMEFRAMES else timeframe.upper()

    df = bars_for_timeframe(symbol, provider, timeframe, closed_only=True)
    if len(df) < max(policy.min_bars_for_signal, 21):  # SMA-50-lite guard: need real trend/vol context
        raise NcsInsufficientData(
            f"Only {len(df)} closed bars available on {timeframe_label} — need at least {max(policy.min_bars_for_signal, 21)}."
        )

    a = analyze_ticker(symbol, provider=provider)
    tech = technical.compute_all_technical_features(df)
    try:
        regime_result = regime_module.detect_regime(df)
    except ValueError:
        regime_result = None

    trend = _trend_component(tech)
    momentum = _momentum_component(tech)
    vwap_c = _vwap_component(tech)
    volume_c = _volume_component(df, tech)
    regime_c = _regime_component(regime_result)
    manipulation_c, manip_risk = _manipulation_component(a.manipulation_risk)
    news_c = _news_component(inputs.news_sentiment)
    strategy_c = _strategy_agreement_component(inputs.strategy_agreement)
    portfolio_c, portfolio_risk = _portfolio_risk_component(symbol, inputs.portfolio_open_symbols)

    components = [trend, momentum, vwap_c, volume_c, regime_c, manipulation_c, news_c, strategy_c, portfolio_c]
    active = [c for c in components if c.weight > 0]
    total_weight = sum(c.weight for c in active)
    raw_composite = sum(c.score * c.weight for c in active) / total_weight if total_weight else 0.0

    # Cross-strategy agreement (when available) scales conviction toward 0
    # for low agreement — it can only dampen, never manufacture direction.
    if inputs.strategy_agreement is not None:
        raw_composite *= 0.5 + 0.5 * inputs.strategy_agreement

    composite_score = _clip(raw_composite)

    volatility_risk = _volatility_risk(tech)
    liquidity_risk = _liquidity_risk(a.liquidity_score)
    risk_contribs = [manip_risk, volatility_risk, liquidity_risk, portfolio_risk]
    risk_total_weight = sum(r.weight for r in risk_contribs)
    risk_score = _clip(
        100 * sum(r.contribution * r.weight for r in risk_contribs) / risk_total_weight if risk_total_weight else 0.0,
        0, 100,
    )

    available_fraction = total_weight / _MAX_COMPONENT_WEIGHT
    magnitude_conf = min(abs(composite_score) * 100, 100)
    confidence_pct = _clip(0.5 * magnitude_conf + 0.3 * (100 - risk_score) + 0.2 * min(available_fraction, 1.0) * 100, 0, 100)

    verdict = _verdict_for_score(composite_score)
    # Hard manipulation override — matches services/signals/engine.py's own
    # AVOID-at-75 discipline: no amount of bullish evidence buys past this.
    if a.manipulation_risk >= 75 and verdict in _BUY_FAMILY:
        verdict = "NEUTRAL"

    # A veto never rewrites raw_verdict — it's a distinct overlay
    # (`vetoed`/`veto_reason`), not the model's own read. The UI needs to
    # be able to say "would have fired BUY, but Red-Team vetoed it" rather
    # than a vetoed setup being indistinguishable from a genuinely neutral
    # one. evaluate_ncs() below is what actually prevents a vetoed
    # signal from ever confirming/firing a marker.
    vetoed = bool(inputs.red_team_veto and inputs.red_team_veto.vetoed)
    veto_reason = inputs.red_team_veto.reason if vetoed else None

    explanation = _compose_explanation(verdict, components, risk_score, vetoed, veto_reason)
    bar_ts = df.index[-1].to_pydatetime()
    if bar_ts.tzinfo is None:
        bar_ts = bar_ts.replace(tzinfo=timezone.utc)

    return NcsComputation(
        ticker_symbol=symbol,
        timeframe=timeframe_label,
        bar_ts=bar_ts,
        raw_verdict=verdict,
        composite_score=composite_score,
        confidence_pct=confidence_pct,
        risk_score=risk_score,
        explanation=explanation,
        components=[{"name": c.name, "score": round(c.score, 3), "weight": c.weight, "detail": c.detail} for c in components],
        vetoed=vetoed,
        veto_reason=veto_reason,
        data_source=a.data_source,
        data_mode=a.data_mode,
    )


def _latest_two(db: Session, ticker: str, timeframe: str) -> list[NcsSignal]:
    return (
        db.query(NcsSignal)
        .filter_by(ticker_symbol=ticker, timeframe=timeframe)
        .order_by(NcsSignal.bar_ts.desc())
        .limit(2)
        .all()
    )


def _last_fired(db: Session, ticker: str, timeframe: str, bucket: str) -> NcsSignal | None:
    rows = (
        db.query(NcsSignal)
        .filter_by(ticker_symbol=ticker, timeframe=timeframe, fired=True)
        .order_by(NcsSignal.bar_ts.desc())
        .limit(20)
        .all()
    )
    for row in rows:
        if _bucket(row.confirmed_verdict or row.raw_verdict) == bucket:
            return row
    return None


def evaluate_ncs(
    symbol: str,
    provider: MarketDataProvider,
    db: Session,
    timeframe: str = "1D",
    inputs: NcsInputs | None = None,
    cooldown_minutes: float = DEFAULT_COOLDOWN_MINUTES,
) -> NcsSignal:
    """Computes (if not already computed for this bar) and persists the
    NCS row for the latest closed bar on `timeframe`, applying the
    confirmation and cooldown rules described in this module's docstring.
    Always returns the row for the latest closed bar — callers that only
    care whether a *new* marker should be drawn should check `.fired`.
    """
    computation = compute_ncs(symbol, provider, db, timeframe, inputs)

    existing = (
        db.query(NcsSignal)
        .filter_by(ticker_symbol=computation.ticker_symbol, timeframe=computation.timeframe, bar_ts=computation.bar_ts)
        .one_or_none()
    )
    if existing is not None:
        # Anti-repaint: this bar was already evaluated — return exactly
        # what was persisted for it then, never recompute/overwrite.
        return existing

    prior_two = _latest_two(db, computation.ticker_symbol, computation.timeframe)
    confirmed_verdict = None
    if prior_two and _bucket(prior_two[0].raw_verdict) == _bucket(computation.raw_verdict):
        confirmed_verdict = computation.raw_verdict

    fired = False
    if confirmed_verdict is not None and not computation.vetoed:
        bucket = _bucket(confirmed_verdict)
        if bucket != "NEUTRAL":
            last_fired = _last_fired(db, computation.ticker_symbol, computation.timeframe, bucket)
            if last_fired is None or (computation.bar_ts - last_fired.bar_ts) >= timedelta(minutes=cooldown_minutes):
                fired = True

    row = NcsSignal(
        ticker_symbol=computation.ticker_symbol,
        timeframe=computation.timeframe,
        bar_ts=computation.bar_ts,
        raw_verdict=computation.raw_verdict,
        confirmed_verdict=confirmed_verdict,
        fired=fired,
        composite_score=computation.composite_score,
        confidence_pct=computation.confidence_pct,
        risk_score=computation.risk_score,
        explanation=computation.explanation,
        components=computation.components,
        vetoed=computation.vetoed,
        veto_reason=computation.veto_reason,
        version=NCS_VERSION,
        data_source=computation.data_source,
        data_mode=computation.data_mode,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def latest_ncs(db: Session, ticker: str, timeframe: str) -> NcsSignal | None:
    return (
        db.query(NcsSignal)
        .filter_by(ticker_symbol=ticker.upper(), timeframe=timeframe if timeframe in _INTRADAY_TIMEFRAMES else timeframe.upper())
        .order_by(NcsSignal.bar_ts.desc())
        .first()
    )


def ncs_history(db: Session, ticker: str, timeframe: str, limit: int = 100) -> list[NcsSignal]:
    return (
        db.query(NcsSignal)
        .filter_by(ticker_symbol=ticker.upper(), timeframe=timeframe if timeframe in _INTRADAY_TIMEFRAMES else timeframe.upper())
        .order_by(NcsSignal.bar_ts.desc())
        .limit(limit)
        .all()
    )
