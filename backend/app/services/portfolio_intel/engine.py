"""Portfolio Intelligence — health, concentration, and sizing discipline.

Operates on the user's recorded positions plus the live analysis of each
holding. Three jobs:

1. `assess_portfolio` — the health report: exposure weights, concentration
   (Herfindahl index + largest position + sector clustering), aggregate
   risk (weight-blended manipulation/liquidity/downside), diversification,
   per-position sizing verdicts against each ticker's risk-derived ceiling,
   and named alerts for every violation.
2. Position sizing recommendations — trim / hold / room-to-add, each with
   the numbers that justify it.
3. Risk optimization is *subtractive*: the engine recommends reducing
   oversized or risk-flagged exposure toward each position's ceiling; it
   never recommends leveraging up to fill "unused" risk budget. The
   cheapest risk optimization is the position you don't oversize.

All portfolio marks come from the live provider; positions the provider
cannot price are reported as unpriced (excluded from weights, flagged) —
never carried at a stale or invented mark.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.db.models.portfolio import PortfolioPosition
from app.services.data_providers.base import MarketDataProvider
from app.services.scoring.scorer import analyze_ticker

logger = logging.getLogger(__name__)

MAX_SINGLE_POSITION_PCT = 25.0
MAX_SECTOR_PCT = 40.0
HHI_CONCENTRATED = 0.30  # Herfindahl above this = concentrated book


@dataclass
class PositionAssessment:
    ticker: str
    quantity: float
    avg_entry_price: float
    current_price: float | None
    market_value: float | None
    weight_pct: float | None
    unrealized_pnl_pct: float | None
    ceiling_pct: float | None          # analysis-derived max allocation
    sizing_verdict: str                # trim | hold | room_to_add | unpriced
    sizing_reason: str
    manipulation_risk: float | None
    liquidity_score: float | None
    sector: str | None


@dataclass
class PortfolioHealth:
    total_market_value: float
    position_count: int
    priced_count: int
    assessments: list[PositionAssessment]
    herfindahl_index: float
    largest_position_pct: float
    sector_weights: dict[str, float]
    weighted_manipulation_risk: float
    weighted_liquidity_score: float
    weighted_downside_first_prob: float
    diversification_score: float       # 0-100
    health_grade: str                  # A/B/C/D
    alerts: list[dict] = field(default_factory=list)


def assess_portfolio(
    db: Session,
    provider: MarketDataProvider,
    user_id: int | None = None,
    include_unowned: bool = False,
) -> PortfolioHealth:
    query = db.query(PortfolioPosition).filter_by(status="open")
    if user_id is not None:
        from sqlalchemy import or_

        if include_unowned:  # local dev principal also sees pre-tenancy rows
            query = query.filter(or_(PortfolioPosition.user_id == user_id, PortfolioPosition.user_id.is_(None)))
        else:
            query = query.filter(PortfolioPosition.user_id == user_id)
    positions = query.all()

    assessments: list[PositionAssessment] = []
    analyses: dict[str, object] = {}
    for position in positions:
        try:
            analysis = analyze_ticker(position.ticker_symbol, provider=provider)
            analyses[position.ticker_symbol] = analysis
            price = analysis.current_price
        except Exception:
            logger.exception("Cannot price %s", position.ticker_symbol)
            analyses[position.ticker_symbol] = None
            price = None

        assessments.append(
            PositionAssessment(
                ticker=position.ticker_symbol,
                quantity=position.quantity,
                avg_entry_price=position.avg_entry_price,
                current_price=price,
                market_value=price * position.quantity if price else None,
                weight_pct=None,  # filled after totals
                unrealized_pnl_pct=(price / position.avg_entry_price - 1) * 100
                if price and position.avg_entry_price
                else None,
                ceiling_pct=analyses[position.ticker_symbol].max_allocation_pct
                if analyses[position.ticker_symbol]
                else None,
                sizing_verdict="unpriced" if price is None else "hold",
                sizing_reason="" if price else "Provider could not price this position — excluded from weights.",
                manipulation_risk=analyses[position.ticker_symbol].manipulation_risk
                if analyses[position.ticker_symbol]
                else None,
                liquidity_score=analyses[position.ticker_symbol].liquidity_score
                if analyses[position.ticker_symbol]
                else None,
                sector=analyses[position.ticker_symbol].sector if analyses[position.ticker_symbol] else None,
            )
        )

    priced = [a for a in assessments if a.market_value]
    total_value = sum(a.market_value for a in priced)

    # --- weights, HHI, sectors -------------------------------------------
    sector_weights: dict[str, float] = {}
    hhi = 0.0
    largest = 0.0
    for a in priced:
        a.weight_pct = a.market_value / total_value * 100 if total_value else 0.0
        hhi += (a.weight_pct / 100) ** 2
        largest = max(largest, a.weight_pct)
        if a.sector:
            sector_weights[a.sector] = sector_weights.get(a.sector, 0.0) + a.weight_pct

    # --- weighted risk profile ----------------------------------------------
    def _weighted(attr_values: list[tuple[float, float]]) -> float:
        total_w = sum(w for w, _ in attr_values)
        return sum(w * v for w, v in attr_values) / total_w if total_w else 0.0

    weighted_manip = _weighted([(a.weight_pct, a.manipulation_risk) for a in priced if a.manipulation_risk is not None])
    weighted_liq = _weighted([(a.weight_pct, a.liquidity_score) for a in priced if a.liquidity_score is not None])
    weighted_downside = _weighted(
        [
            (a.weight_pct, analyses[a.ticker].probability_downside_before_upside * 100)
            for a in priced
            if analyses.get(a.ticker)
        ]
    )

    # --- sizing verdicts vs. per-ticker ceilings ------------------------------
    alerts: list[dict] = []
    for a in priced:
        if a.ceiling_pct is None:
            continue
        if a.weight_pct > max(a.ceiling_pct, MAX_SINGLE_POSITION_PCT):
            a.sizing_verdict = "trim"
            a.sizing_reason = (
                f"Weight {a.weight_pct:.1f}% exceeds both the ticker's risk-derived ceiling "
                f"({a.ceiling_pct:.1f}%) and the portfolio's single-position limit ({MAX_SINGLE_POSITION_PCT:.0f}%)."
            )
        elif a.weight_pct > a.ceiling_pct:
            a.sizing_verdict = "trim"
            a.sizing_reason = (
                f"Weight {a.weight_pct:.1f}% exceeds this ticker's risk-derived ceiling of "
                f"{a.ceiling_pct:.1f}% (manipulation {a.manipulation_risk:.0f}/100, liquidity {a.liquidity_score:.0f}/100)."
            )
        elif a.weight_pct < a.ceiling_pct * 0.5:
            a.sizing_verdict = "room_to_add"
            a.sizing_reason = (
                f"Weight {a.weight_pct:.1f}% is under half the {a.ceiling_pct:.1f}% ceiling — room exists "
                f"IF the thesis still holds; this is capacity, not a buy instruction."
            )
        else:
            a.sizing_verdict = "hold"
            a.sizing_reason = f"Weight {a.weight_pct:.1f}% sits within the {a.ceiling_pct:.1f}% ceiling."

    # --- alerts ------------------------------------------------------------------
    if largest > MAX_SINGLE_POSITION_PCT:
        worst = max(priced, key=lambda a: a.weight_pct)
        alerts.append(
            {
                "severity": "critical",
                "code": "excessive_single_position",
                "message": f"{worst.ticker} is {worst.weight_pct:.1f}% of the portfolio (limit {MAX_SINGLE_POSITION_PCT:.0f}%). A single sharp drop in this name dominates the whole book.",
            }
        )
    for sector, weight in sector_weights.items():
        if weight > MAX_SECTOR_PCT:
            alerts.append(
                {
                    "severity": "warning",
                    "code": "sector_concentration",
                    "message": f"{sector} is {weight:.1f}% of the portfolio (limit {MAX_SECTOR_PCT:.0f}%) — one sector-wide event moves most of the book.",
                }
            )
    if hhi > HHI_CONCENTRATED and len(priced) > 1:
        alerts.append(
            {
                "severity": "warning",
                "code": "concentrated_book",
                "message": f"Herfindahl index {hhi:.2f} (threshold {HHI_CONCENTRATED}) — effective diversification is ~{(1 / hhi):.1f} positions regardless of nominal count.",
            }
        )
    if weighted_manip > 50:
        alerts.append(
            {
                "severity": "critical",
                "code": "portfolio_manipulation_exposure",
                "message": f"Weight-averaged manipulation risk is {weighted_manip:.0f}/100 — the book leans on flagged names.",
            }
        )
    for a in assessments:
        if a.sizing_verdict == "unpriced":
            alerts.append(
                {
                    "severity": "warning",
                    "code": "unpriced_position",
                    "message": f"{a.ticker} could not be priced by the active provider — its risk is invisible to this report.",
                }
            )

    # --- diversification score & grade -----------------------------------------
    effective_n = (1 / hhi) if hhi > 0 else 0.0
    diversification = min(effective_n / 8 * 60, 60) + min(len(sector_weights) / 4 * 40, 40)
    penalties = sum(20 for al in alerts if al["severity"] == "critical") + sum(
        10 for al in alerts if al["severity"] == "warning"
    )
    health_points = max(0.0, min(100.0, diversification * 0.5 + (100 - weighted_manip) * 0.3 + weighted_liq * 0.2 - penalties))
    grade = "A" if health_points >= 75 else "B" if health_points >= 55 else "C" if health_points >= 35 else "D"

    return PortfolioHealth(
        total_market_value=round(total_value, 2),
        position_count=len(assessments),
        priced_count=len(priced),
        assessments=assessments,
        herfindahl_index=round(hhi, 4),
        largest_position_pct=round(largest, 2),
        sector_weights={k: round(v, 2) for k, v in sector_weights.items()},
        weighted_manipulation_risk=round(weighted_manip, 1),
        weighted_liquidity_score=round(weighted_liq, 1),
        weighted_downside_first_prob=round(weighted_downside, 1),
        diversification_score=round(diversification, 1),
        health_grade=grade,
        alerts=alerts,
    )
