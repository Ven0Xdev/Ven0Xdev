"""Tool registry for the research assistant.

The assistant must never answer from memory when live data is required —
every quantitative claim comes from executing one of these tools against
the backend's own services. Each tool is (schema for the LLM) + (local
executor). Executors call services directly (no HTTP hop) and return
JSON-serializable dicts; failures return {"error": ...} so the model can
tell the user what's missing instead of guessing.

The same registry serves both chat backends: the LLM backend passes the
schemas to Anthropic tool-calling; the template backend calls executors
directly.
"""
from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.services.data_providers.base import MarketDataProvider

logger = logging.getLogger(__name__)


def _tool_get_stock_analysis(args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    from app.services.scoring.scorer import analyze_ticker

    analysis = analyze_ticker(args["symbol"], provider=provider)
    payload = analysis.model_dump()
    payload.pop("feature_vector", None)  # model internals, not chat material
    return payload


def _tool_get_deliberation(args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    from app.services.agents.reasoning_engine import ReasoningEngine

    deliberation = ReasoningEngine().deliberate(args["symbol"], provider=provider, db=db)
    return asdict(deliberation)


def _tool_get_recent_news(args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    news = provider.get_news(args["symbol"], limit=int(args.get("limit", 10)))
    return {
        "symbol": args["symbol"].upper(),
        "articles": [
            {
                "published_at": n.published_at.isoformat(),
                "source": n.source,
                "headline": n.headline,
                "sentiment": n.sentiment,
                "is_promotional": n.is_promotional,
            }
            for n in news
        ],
    }


def _tool_get_prediction_history(args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    if db is None:
        return {"error": "prediction store not available in this session"}
    from app.db.models.prediction import Outcome, Prediction

    symbol = args["symbol"].upper()
    rows = (
        db.query(Prediction)
        .filter_by(ticker_symbol=symbol)
        .order_by(Prediction.created_at.desc())
        .limit(int(args.get("limit", 10)))
        .all()
    )
    graded = {
        o.prediction_id: o
        for o in db.query(Outcome).filter(Outcome.prediction_id.in_([r.id for r in rows]))
    }
    return {
        "symbol": symbol,
        "predictions": [
            {
                "created_at": r.created_at.isoformat(),
                "overall_ai_score": r.overall_ai_score,
                "prob_up_10": r.prob_up_10,
                "outcome": (
                    {
                        "realized_return_pct": graded[r.id].realized_return_pct,
                        "hit_take_profit_1": graded[r.id].hit_take_profit_1,
                        "hit_stop_loss": graded[r.id].hit_stop_loss,
                    }
                    if r.id in graded
                    else "not yet matured"
                ),
            }
            for r in rows
        ],
    }


def _tool_get_calibration_report(args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    if db is None:
        return {"error": "outcome store not available in this session"}
    from app.services.evaluation.outcome_evaluator import build_calibration_report

    return build_calibration_report(db)


def _tool_search_universe(args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    query = args.get("query", "").upper()
    matches = [
        {"symbol": t.symbol, "company_name": t.company_name, "tier": t.tier, "sector": t.sector}
        for t in provider.get_universe()
        if query in t.symbol or query in t.company_name.upper()
    ]
    return {"matches": matches[:20], "total": len(matches)}


TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_stock_analysis",
        "description": "Full current AI analysis for a ticker: all scores, probability matrix, trade plan, manipulation flags, explanation. Use for ANY quantitative claim about a stock.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string", "description": "Ticker symbol"}},
            "required": ["symbol"],
        },
        "executor": _tool_get_stock_analysis,
    },
    {
        "name": "get_deliberation",
        "description": "The staged multi-agent deliberation for a ticker: evidence for/against, contrarian findings, risk assessment, verdict. Use when asked WHY or for the reasoning behind a view.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}},
            "required": ["symbol"],
        },
        "executor": _tool_get_deliberation,
    },
    {
        "name": "get_recent_news",
        "description": "Recent news/press coverage for a ticker, with promotional-content flags.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["symbol"],
        },
        "executor": _tool_get_recent_news,
    },
    {
        "name": "get_prediction_history",
        "description": "The platform's own logged predictions for a ticker and how graded ones actually turned out. Use for 'what happened before' / track-record questions.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["symbol"],
        },
        "executor": _tool_get_prediction_history,
    },
    {
        "name": "get_calibration_report",
        "description": "Platform-wide honesty report: predicted probabilities vs realized frequencies. Use when asked how reliable/accurate the platform's probabilities are.",
        "input_schema": {"type": "object", "properties": {}},
        "executor": _tool_get_calibration_report,
    },
    {
        "name": "search_universe",
        "description": "Search the scanned universe by symbol or company-name fragment.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        "executor": _tool_search_universe,
    },
]

_BY_NAME: dict[str, Callable] = {t["name"]: t["executor"] for t in TOOLS}


def anthropic_tool_schemas() -> list[dict]:
    return [{k: t[k] for k in ("name", "description", "input_schema")} for t in TOOLS]


def execute_tool(name: str, args: dict, db: Session | None, provider: MarketDataProvider) -> dict:
    executor = _BY_NAME.get(name)
    if executor is None:
        return {"error": f"unknown tool {name!r}; available: {sorted(_BY_NAME)}"}
    try:
        return executor(args or {}, db, provider)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tool %s failed", name)
        return {"error": f"{name} failed: {exc}"}
