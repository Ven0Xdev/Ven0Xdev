"""Rule-based manipulation risk scoring.

This is a transparent, explainable heuristic layer (each flag is individually
inspectable and contributes an auditable weight) that is combined downstream
with the statistical anomaly-detection model in `services/ml/anomaly.py`.
Relying on a single black-box "manipulation score" would be dangerous in a
financial product — every flag here maps to a plain-English reason surfaced
in the final explanation.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from app.services.data_providers.base import Fundamentals, NewsArticle, TickerMeta


@dataclass
class ManipulationFlag:
    code: str
    severity: float  # 0..100 contribution
    reason: str


@dataclass
class ManipulationAssessment:
    score: float  # 0-100, higher = more risk
    flags: list[ManipulationFlag] = field(default_factory=list)

    @property
    def top_reasons(self) -> list[str]:
        return [f.reason for f in sorted(self.flags, key=lambda f: -f.severity)[:5]]


def _pump_and_dump_flag(df: pd.DataFrame) -> ManipulationFlag | None:
    if len(df) < 15:
        return None
    returns = df["close"].pct_change()
    vol = df["volume"]
    recent = returns.tail(10)
    recent_vol = vol.tail(10)
    baseline_vol = vol.iloc[:-10].tail(30).mean() if len(vol) > 40 else vol.mean()

    max_run_up = (df["close"].tail(10).max() / df["close"].tail(15).min() - 1) * 100 if df["close"].tail(15).min() else 0
    vol_spike = recent_vol.max() / baseline_vol if baseline_vol else 1.0
    subsequent_drop = 0.0
    peak_idx = df["close"].tail(10).idxmax()
    if peak_idx in df.index:
        after = df.loc[peak_idx:, "close"]
        if len(after) > 1:
            subsequent_drop = (after.iloc[-1] / after.iloc[0] - 1) * 100

    if max_run_up > 40 and vol_spike > 3 and subsequent_drop < -15:
        return ManipulationFlag(
            code="pump_and_dump_pattern",
            severity=min(95, 40 + max_run_up / 3 + vol_spike * 2),
            reason=(
                f"Price spiked {max_run_up:.0f}% on a {vol_spike:.1f}x volume surge and then reversed "
                f"{subsequent_drop:.0f}% — classic pump-and-dump signature."
            ),
        )
    if max_run_up > 30 and vol_spike > 5:
        return ManipulationFlag(
            code="volume_spike_no_catalyst",
            severity=min(70, 25 + vol_spike * 3),
            reason=f"Volume surged {vol_spike:.1f}x above baseline alongside a {max_run_up:.0f}% run-up.",
        )
    return None


def _wash_trading_flag(df: pd.DataFrame) -> ManipulationFlag | None:
    if len(df) < 10:
        return None
    # Heuristic: very high volume with near-zero net price movement and tight range
    recent = df.tail(10)
    price_range_pct = (recent["high"].max() - recent["low"].min()) / recent["close"].mean() * 100
    vol_z = (recent["volume"].mean() - df["volume"].mean()) / (df["volume"].std() or 1)
    if vol_z > 2 and price_range_pct < 8:
        return ManipulationFlag(
            code="wash_trading_suspected",
            severity=min(80, 30 + vol_z * 10),
            reason=(
                f"Volume is {vol_z:.1f} std devs above normal while price barely moved "
                f"({price_range_pct:.1f}% range) — consistent with wash trading / fake volume."
            ),
        )
    return None


def _spread_flag(spread_pct: float) -> ManipulationFlag | None:
    if spread_pct > 15:
        return ManipulationFlag(
            code="abnormal_spread",
            severity=min(60, spread_pct),
            reason=f"Bid/ask spread of {spread_pct:.1f}% indicates severe illiquidity or a liquidity trap.",
        )
    return None


def _dilution_flag(fund: Fundamentals) -> ManipulationFlag | None:
    if fund.dilution_12m_pct > 50:
        return ManipulationFlag(
            code="toxic_dilution",
            severity=min(90, fund.dilution_12m_pct * 0.8),
            reason=(
                f"Share count grew {fund.dilution_12m_pct:.0f}% over the trailing 12 months — heavy dilution, "
                "possibly toxic convertible financing."
            ),
        )
    if fund.dilution_12m_pct > 20:
        return ManipulationFlag(
            code="elevated_dilution",
            severity=min(50, fund.dilution_12m_pct),
            reason=f"Share count grew {fund.dilution_12m_pct:.0f}% over the trailing 12 months.",
        )
    return None


def _reverse_split_flag(meta: TickerMeta) -> ManipulationFlag | None:
    if meta.reverse_split_count_3y >= 2:
        return ManipulationFlag(
            code="repeated_reverse_splits",
            severity=min(85, 30 + meta.reverse_split_count_3y * 20),
            reason=(
                f"{meta.reverse_split_count_3y} reverse splits in the last 3 years — a recurring pattern often "
                "used to reset share price ahead of further dilution."
            ),
        )
    return None


def _filing_quality_flag(fund: Fundamentals) -> ManipulationFlag | None:
    if fund.filing_delinquent:
        return ManipulationFlag(
            code="delinquent_filer",
            severity=65,
            reason="Company is delinquent on required disclosures — low reporting quality raises information risk.",
        )
    if fund.going_concern_flag:
        return ManipulationFlag(
            code="going_concern",
            severity=45,
            reason="Auditor has issued a going-concern doubt — elevated risk of insolvency or forced dilution.",
        )
    return None


def _promotional_news_flag(news: list[NewsArticle]) -> ManipulationFlag | None:
    if not news:
        return None
    promo = [n for n in news if n.is_promotional]
    ratio = len(promo) / len(news)
    if ratio >= 0.4:
        return ManipulationFlag(
            code="promotional_campaign",
            severity=min(75, ratio * 100),
            reason=(
                f"{len(promo)} of {len(news)} recent articles look like paid stock-promotion content rather "
                "than independent reporting."
            ),
        )
    return None


def _liquidity_trap_flag(meta: TickerMeta, avg_dollar_volume: float) -> ManipulationFlag | None:
    if meta.float_shares < 5_000_000 and avg_dollar_volume < 25_000:
        return ManipulationFlag(
            code="low_liquidity_trap",
            severity=55,
            reason=(
                f"Float of {meta.float_shares:,.0f} shares with only ${avg_dollar_volume:,.0f}/day traded — "
                "position sizing risk is high; exits can move the price sharply."
            ),
        )
    return None


def assess_manipulation_risk(
    df: pd.DataFrame,
    meta: TickerMeta,
    fundamentals: Fundamentals,
    news: list[NewsArticle],
    spread_pct: float,
    avg_dollar_volume: float,
) -> ManipulationAssessment:
    flags = [
        _pump_and_dump_flag(df),
        _wash_trading_flag(df),
        _spread_flag(spread_pct),
        _dilution_flag(fundamentals),
        _reverse_split_flag(meta),
        _filing_quality_flag(fundamentals),
        _promotional_news_flag(news),
        _liquidity_trap_flag(meta, avg_dollar_volume),
    ]
    active = [f for f in flags if f is not None]
    if not active:
        return ManipulationAssessment(score=5.0, flags=[])

    # Weighted combination: not a simple average, since multiple co-occurring
    # red flags compound risk rather than diluting it.
    severities = np.array([f.severity for f in active])
    combined = 1 - np.prod(1 - severities / 100)
    score = float(np.clip(combined * 100, 0, 100))
    return ManipulationAssessment(score=score, flags=active)
