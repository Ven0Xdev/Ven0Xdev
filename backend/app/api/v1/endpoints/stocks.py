from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session
from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import MarketDataProvider
from app.services.scoring.scorer import analyze_ticker

router = APIRouter(prefix="/stocks", tags=["stocks"])

_SYMBOL_RE = __import__("re").compile(r"^[A-Z0-9.\-]{1,10}$")


@router.get("/search")
def search_and_validate(q: str, provider: MarketDataProvider = Depends(data_provider)):
    """Ticker search + validation (P0-2). Searches the provider universe by
    symbol/name fragment; if nothing matches but the query is a validly
    formatted symbol, attempts a direct provider lookup. Unknown symbols
    are reported as unknown — never fabricated.
    """
    from datetime import datetime, timezone

    query = q.strip().upper()
    valid_format = bool(_SYMBOL_RE.match(query))
    response = {
        "query": query,
        "valid_format": valid_format,
        "source": provider.name,
        "data_mode": getattr(provider, "data_mode", "unspecified"),
        "as_of": datetime.now(timezone.utc).isoformat(),
        "matches": [],
    }
    if not query:
        return response

    matches = [
        {"symbol": t.symbol, "company_name": t.company_name, "tier": t.tier, "sector": t.sector, "in_universe": True}
        for t in provider.get_universe()
        if query in t.symbol or query in t.company_name.upper()
    ][:20]

    if not matches and valid_format:
        try:
            meta = provider.get_ticker_meta(query)
            matches = [{
                "symbol": meta.symbol, "company_name": meta.company_name,
                "tier": meta.tier, "sector": meta.sector, "in_universe": False,
            }]
        except Exception:
            matches = []  # honestly unknown

    response["matches"] = matches
    return response


@router.get("/{symbol}/deliberation")
def get_stock_deliberation(
    symbol: str,
    provider: MarketDataProvider = Depends(data_provider),
    db: Session = Depends(db_session),
):
    """Full staged AI deliberation: evidence -> confidence -> contradiction
    -> risk -> explanation -> recommendation. Returns the complete trace,
    not just the verdict — the reasoning is the product.
    """
    from app.services.agents.reasoning_engine import ReasoningEngine

    try:
        deliberation = ReasoningEngine().deliberate(symbol, provider=provider, db=db)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Could not deliberate on {symbol}: {exc}") from exc
    return asdict(deliberation)


@router.get("/universe")
def get_universe(limit: int = 100, provider: MarketDataProvider = Depends(data_provider)):
    tickers = provider.get_universe(limit=limit)
    return [
        {
            "symbol": t.symbol,
            "company_name": t.company_name,
            "tier": t.tier,
            "sector": t.sector,
            "market_cap": t.market_cap,
            "float_shares": t.float_shares,
        }
        for t in tickers
    ]


@router.get("/{symbol}/analysis", response_model=StockAnalysis)
def get_stock_analysis(symbol: str):
    try:
        return analyze_ticker(symbol)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Could not analyze {symbol}: {exc}") from exc


@router.get("/{symbol}/ohlcv")
def get_stock_ohlcv(symbol: str, lookback_days: int = 250, provider: MarketDataProvider = Depends(data_provider)):
    df = provider.get_ohlcv(symbol, lookback_days=lookback_days)
    return {
        "symbol": symbol.upper(),
        "bars": [
            {
                "ts": ts.isoformat(),
                "open": round(float(row.open), 4),
                "high": round(float(row.high), 4),
                "low": round(float(row.low), 4),
                "close": round(float(row.close), 4),
                "volume": float(row.volume),
            }
            for ts, row in df.iterrows()
        ],
    }


@router.get("/{symbol}/news")
def get_stock_news(symbol: str, limit: int = 20, provider: MarketDataProvider = Depends(data_provider)):
    news = provider.get_news(symbol, limit=limit)
    return [
        {
            "published_at": n.published_at.isoformat(),
            "source": n.source,
            "headline": n.headline,
            "url": n.url,
            "sentiment": n.sentiment,
            "is_press_release": n.is_press_release,
            "is_promotional": n.is_promotional,
        }
        for n in news
    ]


@router.get("/{symbol}/fundamentals")
def get_stock_fundamentals(symbol: str, provider: MarketDataProvider = Depends(data_provider)):
    f = provider.get_fundamentals(symbol)
    return {
        "symbol": f.symbol,
        "market_cap": f.market_cap,
        "float_shares": f.float_shares,
        "shares_outstanding": f.shares_outstanding,
        "cash": f.cash,
        "total_debt": f.total_debt,
        "revenue_ttm": f.revenue_ttm,
        "net_income_ttm": f.net_income_ttm,
        "dilution_12m_pct": f.dilution_12m_pct,
        "going_concern_flag": f.going_concern_flag,
        "filing_delinquent": f.filing_delinquent,
        "last_filing_date": f.last_filing_date.isoformat() if f.last_filing_date else None,
    }
