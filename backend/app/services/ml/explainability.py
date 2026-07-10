"""SHAP-based explainability for the ensemble's feature contributions,
translated into plain-English reasons for the chat assistant and API output.
"""
from __future__ import annotations

import numpy as np

_FEATURE_LABELS = {
    "rsi_14": "RSI momentum",
    "macd_histogram": "MACD trend momentum",
    "adx": "trend strength (ADX)",
    "atr_pct": "volatility (ATR)",
    "bb_width_pct": "Bollinger Band compression",
    "pct_from_52w_high": "distance from 52-week high",
    "pct_from_52w_low": "distance from 52-week low",
    "relative_volume": "relative volume",
    "historical_volatility_pct": "historical volatility",
    "gap_pct": "recent price gap",
    "spread_pct": "bid/ask spread",
    "liquidity_score": "liquidity",
    "fundamental_score": "fundamental health",
    "sentiment_score": "news/social sentiment",
    "catalyst_score": "upcoming catalysts",
    "manipulation_risk": "manipulation risk",
    "dilution_12m_pct": "share dilution",
    "insider_ownership_pct": "insider ownership",
    "institutional_ownership_pct": "institutional ownership",
    "reverse_split_count_3y": "reverse-split history",
    "price_vs_vwap_pct": "price vs. VWAP",
    "price_vs_sma20_pct": "price vs. 20-day average",
    "price_vs_ema9_pct": "price vs. 9-day EMA",
}


def explain_with_shap(model, X_background: np.ndarray, x_row: np.ndarray, feature_names: list[str]) -> dict:
    """Returns per-feature SHAP contributions for x_row.

    Falls back to a permutation-style approximation if the `shap` package is
    unavailable, so the API contract (`shap_top_factors`) is always populated.
    """
    try:
        import shap

        explainer = shap.TreeExplainer(model)
        values = explainer.shap_values(x_row.reshape(1, -1))
        values = values[1] if isinstance(values, list) else values
        contributions = dict(zip(feature_names, values.flatten().tolist()))
    except Exception:
        contributions = _fallback_contribution(x_row, feature_names)

    ranked = sorted(contributions.items(), key=lambda kv: -abs(kv[1]))
    return {
        "contributions": contributions,
        "top_factors": [
            {
                "feature": name,
                "label": _FEATURE_LABELS.get(name, name),
                "impact": round(val, 4),
                "direction": "bullish" if val > 0 else "bearish",
            }
            for name, val in ranked[:6]
        ],
    }


def _fallback_contribution(x_row: np.ndarray, feature_names: list[str]) -> dict:
    """Z-score-vs-neutral proxy for feature contribution when SHAP isn't
    installed. Not a substitute for real Shapley values in production.
    """
    neutral = {
        "rsi_14": 50,
        "macd_histogram": 0,
        "adx": 20,
        "manipulation_risk": 20,
        "liquidity_score": 50,
        "fundamental_score": 50,
        "sentiment_score": 50,
        "catalyst_score": 40,
    }
    out = {}
    for name, val in zip(feature_names, x_row):
        base = neutral.get(name, 0)
        scale = max(abs(base), 1)
        out[name] = float(np.clip((val - base) / scale, -1, 1))
    return out


def build_plain_english_explanation(
    ticker: str,
    overall_score: float,
    top_factors: list[dict],
    manipulation_reasons: list[str],
    prob_up_10: float,
    confidence: float,
) -> str:
    bullets = []
    bullish = [f for f in top_factors if f["direction"] == "bullish"][:3]
    bearish = [f for f in top_factors if f["direction"] == "bearish"][:3]

    if bullish:
        bullets.append("Supporting factors: " + ", ".join(f["label"] for f in bullish) + ".")
    if bearish:
        bullets.append("Working against it: " + ", ".join(f["label"] for f in bearish) + ".")
    if manipulation_reasons:
        bullets.append("Manipulation watch: " + " ".join(manipulation_reasons[:2]))

    summary = (
        f"{ticker} scores {overall_score:.0f}/100 overall with an estimated "
        f"{prob_up_10*100:.0f}% probability of reaching +10% within the modeled horizon, at "
        f"{confidence:.0f}% model confidence. " + " ".join(bullets) + " "
        "This is a probabilistic estimate, not a guarantee — treat it as one input "
        "alongside your own risk management."
    )
    return summary
