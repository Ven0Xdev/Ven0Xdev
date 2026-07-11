"""Composes data providers + feature engineering + the ML ensemble into the
platform's single AI Output contract (`schemas.stock.StockAnalysis`).

This is the one place that should be called by API routers, the scan worker,
and the chat assistant, so every surface of the product sees identical
numbers for a given ticker/timestamp.
"""
from __future__ import annotations

import threading
import time
from functools import lru_cache

import numpy as np

from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider
from app.services.features import catalyst, fundamental, liquidity, manipulation, sentiment, technical
from app.services.ml import forecasting
from app.services.ml.explainability import build_plain_english_explanation, explain_with_shap
from app.services.ml.feature_vector import FEATURE_NAMES
from app.services.ml.training_pipeline import load_latest_model
from app.services.ml.ensemble import EnsembleModel
from app.schemas.stock import HorizonProbabilities, ManipulationFlagOut, StockAnalysis, TopFactor

HORIZONS_DAYS = [5, 10, 20]
PRIMARY_HORIZON = 10

# Analyzing a ticker runs the full feature + ensemble + Monte-Carlo pipeline,
# which is too expensive to redo on every widget on the dashboard hitting the
# same 30-ticker universe within the same few seconds. Cache only applies to
# calls with the default (live) data provider — backtests and other callers
# that pass an explicit point-in-time provider always bypass it.
_ANALYSIS_CACHE_TTL_SECONDS = 30
_analysis_cache: dict[str, tuple[float, StockAnalysis]] = {}
_analysis_cache_lock = threading.Lock()


@lru_cache
def _cached_model() -> EnsembleModel:
    model = load_latest_model()
    return model if model is not None else EnsembleModel()


def analyze_ticker(symbol: str, provider: MarketDataProvider | None = None) -> StockAnalysis:
    symbol = symbol.upper()
    provider = provider or get_data_provider()
    # Only cache calls hitting the app's live singleton provider. Backtests
    # and other point-in-time callers pass a throwaway provider instance
    # (e.g. a window-clamped subclass) and must always bypass the cache.
    use_cache = provider is get_data_provider()

    if use_cache:
        with _analysis_cache_lock:
            cached = _analysis_cache.get(symbol)
            if cached is not None and time.monotonic() - cached[0] < _ANALYSIS_CACHE_TTL_SECONDS:
                return cached[1]

    result = _analyze_ticker_uncached(symbol, provider)

    if use_cache:
        with _analysis_cache_lock:
            _analysis_cache[symbol] = (time.monotonic(), result)

    return result


def _analyze_ticker_uncached(symbol: str, provider: MarketDataProvider) -> StockAnalysis:

    meta = provider.get_ticker_meta(symbol)
    df = provider.get_ohlcv(symbol, lookback_days=300)
    fundamentals = provider.get_fundamentals(symbol)
    news = provider.get_news(symbol)
    corp_actions = provider.get_corporate_actions(symbol)

    tech = technical.compute_all_technical_features(df)
    technical_score, _tech_components = technical.compute_technical_score(tech)

    liquidity_score, _liq_detail = liquidity.compute_liquidity_score(
        tech["avg_dollar_volume_20d"], tech["spread_pct"], tech["relative_volume"], meta.float_shares
    )

    manip_assessment = manipulation.assess_manipulation_risk(
        df, meta, fundamentals, news, tech["spread_pct"], tech["avg_dollar_volume_20d"]
    )

    from app.services.ml.anomaly import compute_anomaly_score

    anomaly_score, _anomaly_detail = compute_anomaly_score(df)
    manipulation_risk = float(np.clip(0.7 * manip_assessment.score + 0.3 * anomaly_score, 0, 100))

    fundamental_score, _fund_detail = fundamental.compute_fundamental_score(meta, fundamentals)
    sentiment_score, _sent_detail = sentiment.compute_sentiment_score(news)
    catalyst_score, _cat_detail = catalyst.compute_catalyst_score(news, corp_actions)

    feature_row = _build_feature_row(
        tech, liquidity_score, fundamental_score, sentiment_score, catalyst_score, manipulation_risk, meta, fundamentals
    )

    model = _cached_model()
    ensemble_pred = model.predict(feature_row)

    explanation_data = explain_with_shap(
        model.models.get(PRIMARY_HORIZON, {}).get("lightgbm", model),
        feature_row.reshape(1, -1),
        feature_row,
        FEATURE_NAMES,
    )

    overall_score = _overall_ai_score(
        technical_score, fundamental_score, sentiment_score, catalyst_score, liquidity_score, manipulation_risk
    )
    confidence_score = _confidence_score(ensemble_pred.agreement_score, liquidity_score, manipulation_risk, len(df))

    probability_matrix = _build_probability_matrix(df, ensemble_pred.probabilities)
    downside_forecast = forecasting.forecast_horizon_distribution(df, PRIMARY_HORIZON)

    entry_zone_low, entry_zone_high, ideal_entry, stop_loss, tp1, tp2, tp3 = _trade_levels(tech)
    rr = _expected_risk_reward(df, ideal_entry, tp1, tp2, tp3, holding_period_days=PRIMARY_HORIZON, downside_prob=downside_forecast["downside_prob"])
    max_allocation_pct = _max_allocation_pct(confidence_score, manipulation_risk, liquidity_score)
    holding_period = _estimate_holding_period(probability_matrix)

    explanation = build_plain_english_explanation(
        ticker=symbol,
        overall_score=overall_score,
        top_factors=explanation_data["top_factors"],
        manipulation_reasons=manip_assessment.top_reasons,
        prob_up_10=next((p.prob_up_10 for p in probability_matrix if p.horizon_days == PRIMARY_HORIZON), 0.3),
        confidence=confidence_score,
    )

    return StockAnalysis(
        ticker=symbol,
        company_name=meta.company_name,
        current_price=tech["price"],
        tier=meta.tier,
        sector=meta.sector,
        liquidity_score=liquidity_score,
        manipulation_risk=manipulation_risk,
        fundamental_score=fundamental_score,
        technical_score=technical_score,
        sentiment_score=sentiment_score,
        catalyst_score=catalyst_score,
        overall_ai_score=overall_score,
        confidence_score=confidence_score,
        probability_matrix=probability_matrix,
        probability_downside_before_upside=downside_forecast["downside_prob"],
        suggested_entry_zone_low=entry_zone_low,
        suggested_entry_zone_high=entry_zone_high,
        ideal_entry_price=ideal_entry,
        stop_loss=stop_loss,
        take_profit_1=tp1,
        take_profit_2=tp2,
        take_profit_3=tp3,
        max_allocation_pct=max_allocation_pct,
        expected_risk_reward=rr,
        estimated_holding_period_days=holding_period,
        explanation=explanation,
        manipulation_flags=[
            ManipulationFlagOut(code=f.code, severity=f.severity, reason=f.reason) for f in manip_assessment.flags
        ],
        top_factors=[TopFactor(**f) for f in explanation_data["top_factors"]],
        feature_vector={name: float(value) for name, value in zip(FEATURE_NAMES, feature_row)},
    )


def _build_feature_row(tech, liquidity_score, fundamental_score, sentiment_score, catalyst_score, manipulation_risk, meta, fundamentals) -> np.ndarray:
    values = {
        "rsi_14": tech["rsi_14"],
        "macd_histogram": tech["macd_histogram"],
        "adx": tech["adx"],
        "atr_pct": tech["atr_pct"],
        "bb_width_pct": tech["bb_width_pct"],
        "pct_from_52w_high": tech["pct_from_52w_high"],
        "pct_from_52w_low": tech["pct_from_52w_low"],
        "relative_volume": tech["relative_volume"],
        "historical_volatility_pct": tech["historical_volatility_pct"],
        "gap_pct": tech["gap_pct"],
        "spread_pct": tech["spread_pct"],
        "liquidity_score": liquidity_score,
        "fundamental_score": fundamental_score,
        "sentiment_score": sentiment_score,
        "catalyst_score": catalyst_score,
        "manipulation_risk": manipulation_risk,
        "dilution_12m_pct": fundamentals.dilution_12m_pct,
        "insider_ownership_pct": meta.insider_ownership_pct or 0.0,
        "institutional_ownership_pct": meta.institutional_ownership_pct or 0.0,
        "reverse_split_count_3y": float(meta.reverse_split_count_3y),
        "price_vs_vwap_pct": (tech["price"] / tech["vwap"] - 1) * 100 if tech["vwap"] else 0.0,
        "price_vs_sma20_pct": (tech["price"] / tech["sma_20"] - 1) * 100 if tech["sma_20"] else 0.0,
        "price_vs_ema9_pct": (tech["price"] / tech["ema_9"] - 1) * 100 if tech["ema_9"] else 0.0,
    }
    return np.array([values[name] for name in FEATURE_NAMES])


def _overall_ai_score(technical_score, fundamental_score, sentiment_score, catalyst_score, liquidity_score, manipulation_risk) -> float:
    weights = {
        "technical": 0.28,
        "fundamental": 0.18,
        "sentiment": 0.12,
        "catalyst": 0.17,
        "liquidity": 0.10,
        "manipulation_penalty": 0.15,
    }
    raw = (
        technical_score * weights["technical"]
        + fundamental_score * weights["fundamental"]
        + sentiment_score * weights["sentiment"]
        + catalyst_score * weights["catalyst"]
        + liquidity_score * weights["liquidity"]
        - manipulation_risk * weights["manipulation_penalty"] * (100 / 100)
    )
    return float(np.clip(raw, 0, 100))


def _confidence_score(agreement_score: float, liquidity_score: float, manipulation_risk: float, n_bars: int) -> float:
    data_quality = float(np.clip(n_bars / 250 * 100, 0, 100))
    raw = agreement_score * 100 * 0.45 + liquidity_score * 0.20 + (100 - manipulation_risk) * 0.20 + data_quality * 0.15
    return float(np.clip(raw, 5, 97))  # never claim near-100% or near-0% certainty


def _build_probability_matrix(df, base_probabilities: dict[int, float]) -> list[HorizonProbabilities]:
    base_horizon_dist = {h: forecasting.forecast_horizon_distribution(df, h) for h in HORIZONS_DAYS}
    primary_std = base_horizon_dist[PRIMARY_HORIZON]["std_pct"] or 1e-6

    matrix = []
    for horizon in HORIZONS_DAYS:
        scale = (base_horizon_dist[horizon]["std_pct"] or 1e-6) / primary_std
        row = {}
        for threshold in (5, 10, 20):
            anchor = base_probabilities.get(threshold, 0.3)
            scaled = float(np.clip(anchor * scale, 0.01, 0.95))
            row[threshold] = scaled
        matrix.append(
            HorizonProbabilities(
                horizon_days=horizon,
                prob_up_5=row[5],
                prob_up_10=row[10],
                prob_up_20=row[20],
            )
        )
    return matrix


def _trade_levels(tech: dict) -> tuple[float, float, float, float, float, float, float]:
    """Levels are guaranteed strictly ordered (stop < entry < tp1 < tp2 < tp3)
    even for sub-penny prices — the predictions table enforces this ordering
    with a CHECK constraint, so rounding may never collapse two levels.
    6-decimal rounding matches OTC sub-penny tick conventions; the stop is
    floored at least 0.5% below entry so risk-per-share never rounds to zero.
    """
    price = tech["price"]
    atr = max(tech["atr"], price * 0.01)

    ideal_entry = round(price, 6)
    min_gap = max(ideal_entry * 0.005, 1e-6)

    entry_zone_low = round(max(price - atr * 0.3, 1e-6), 6)
    entry_zone_high = round(price + atr * 0.15, 6)

    raw_stop = max(price - atr * 1.5, 1e-6)
    stop_loss = round(min(raw_stop, ideal_entry - min_gap), 6)
    stop_loss = max(stop_loss, 1e-6)

    risk_per_share = ideal_entry - stop_loss  # >= min_gap by construction

    tp1 = round(ideal_entry + risk_per_share * 1.0, 6)
    tp2 = round(ideal_entry + risk_per_share * 2.0, 6)
    tp3 = round(ideal_entry + risk_per_share * 3.5, 6)

    return entry_zone_low, entry_zone_high, ideal_entry, stop_loss, tp1, tp2, tp3


def _expected_risk_reward(df, entry: float, tp1: float, tp2: float, tp3: float, holding_period_days: int, downside_prob: float) -> float:
    """Probability-weighted expected reward-to-risk, in R-multiples.

    The tiered take-profit prices (1R/2R/3.5R) are fixed by construction, so
    a plain price-ratio R:R would be an identical constant for every ticker.
    Instead this weights each tier's R-multiple by its own Monte-Carlo touch
    probability (`forecasting.probability_of_touching_threshold`) so the
    figure actually reflects how likely *this* ticker's volatility profile is
    to reach each target before the holding period ends.
    """
    if entry <= 0:
        return 0.0

    tier_multiples = [(tp1, 1.0), (tp2, 2.0), (tp3, 3.5)]
    expected_reward = 0.0
    for tp_price, multiple in tier_multiples:
        threshold_pct = (tp_price / entry - 1) * 100
        touch_prob = forecasting.probability_of_touching_threshold(df, holding_period_days, threshold_pct, n_sims=600)
        expected_reward += touch_prob * multiple

    expected_risk = max(downside_prob, 0.05)  # floor: never divide by a near-zero risk probability
    return float(np.clip(round(expected_reward / expected_risk, 2), 0.05, 15.0))


def _max_allocation_pct(confidence_score: float, manipulation_risk: float, liquidity_score: float) -> float:
    base = 5.0
    penalty = (manipulation_risk / 100) * 3.5 + max(0, (50 - liquidity_score) / 50) * 1.5
    conviction = confidence_score / 100
    allocation = base * conviction - penalty
    return float(np.clip(round(allocation, 2), 0.25, 5.0))


def _estimate_holding_period(probability_matrix: list[HorizonProbabilities]) -> int:
    best = max(probability_matrix, key=lambda p: p.prob_up_10)
    return best.horizon_days
