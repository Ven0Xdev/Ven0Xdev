from __future__ import annotations

import numpy as np

from app.services.data_providers.base import Fundamentals, TickerMeta


def compute_fundamental_score(meta: TickerMeta, fund: Fundamentals) -> tuple[float, dict]:
    """0-100 fundamental health score for an OTC micro/nano-cap.

    Components (weights): solvency/runway, profitability trend, dilution
    discipline, ownership alignment, filing quality.
    """
    runway_months = _runway_months(fund)
    runway_score = float(np.clip(runway_months / 18 * 100, 0, 100))

    margin = (fund.net_income_ttm / fund.revenue_ttm) if fund.revenue_ttm > 0 else -1.0
    profitability_score = float(np.clip((margin + 1) / 1.3 * 100, 0, 100))

    dilution_score = float(np.clip(100 - fund.dilution_12m_pct * 1.2, 0, 100))

    insider = meta.insider_ownership_pct or 0
    institutional = meta.institutional_ownership_pct or 0
    ownership_score = float(np.clip(insider * 0.6 + institutional * 3.0, 0, 100))

    filing_score = 20.0 if fund.filing_delinquent else (55.0 if fund.going_concern_flag else 90.0)

    weights = {
        "runway": 0.30,
        "profitability": 0.15,
        "dilution_discipline": 0.25,
        "ownership_alignment": 0.15,
        "filing_quality": 0.15,
    }
    components = {
        "runway": runway_score,
        "profitability": profitability_score,
        "dilution_discipline": dilution_score,
        "ownership_alignment": ownership_score,
        "filing_quality": filing_score,
    }
    total = sum(components[k] * w for k, w in weights.items())
    return float(np.clip(total, 0, 100)), {
        **components,
        "runway_months_estimate": runway_months,
        "net_margin_ttm": margin,
    }


def _runway_months(fund: Fundamentals) -> float:
    monthly_burn = max((fund.total_debt * 0.02 + max(-fund.net_income_ttm, 0) / 12), 1.0)
    return float(np.clip(fund.cash / monthly_burn, 0, 60))
