"""Canonical feature vector shared by every model in the ensemble.

Keeping one ordered feature schema means LightGBM/XGBoost/CatBoost/the
anomaly detector/SHAP can all consume the same numpy row, and the training
pipeline and inference pipeline can never silently drift apart.
"""
from __future__ import annotations

from dataclasses import dataclass, fields

# Bumped whenever FEATURE_NAMES' membership, order, or meaning changes —
# services/monitoring/drift.py keys its cohort isolation on this so a
# schema change can never silently compare feature values computed under
# two different definitions of "rsi_14" (or a differently-ordered vector)
# as if they were the same distribution.
FEATURE_SCHEMA_VERSION = "features-v1"

FEATURE_NAMES: list[str] = [
    "rsi_14",
    "macd_histogram",
    "adx",
    "atr_pct",
    "bb_width_pct",
    "pct_from_52w_high",
    "pct_from_52w_low",
    "relative_volume",
    "historical_volatility_pct",
    "gap_pct",
    "spread_pct",
    "liquidity_score",
    "fundamental_score",
    "sentiment_score",
    "catalyst_score",
    "manipulation_risk",
    "dilution_12m_pct",
    "insider_ownership_pct",
    "institutional_ownership_pct",
    "reverse_split_count_3y",
    "price_vs_vwap_pct",
    "price_vs_sma20_pct",
    "price_vs_ema9_pct",
]


@dataclass
class FeatureVector:
    rsi_14: float
    macd_histogram: float
    adx: float
    atr_pct: float
    bb_width_pct: float
    pct_from_52w_high: float
    pct_from_52w_low: float
    relative_volume: float
    historical_volatility_pct: float
    gap_pct: float
    spread_pct: float
    liquidity_score: float
    fundamental_score: float
    sentiment_score: float
    catalyst_score: float
    manipulation_risk: float
    dilution_12m_pct: float
    insider_ownership_pct: float
    institutional_ownership_pct: float
    reverse_split_count_3y: float
    price_vs_vwap_pct: float
    price_vs_sma20_pct: float
    price_vs_ema9_pct: float

    def to_list(self) -> list[float]:
        return [getattr(self, f.name) for f in fields(self)]

    @staticmethod
    def names() -> list[str]:
        return list(FEATURE_NAMES)
