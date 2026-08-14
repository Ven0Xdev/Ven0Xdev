from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import data_provider, db_session
from app.schemas.stock import StockAnalysis
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.scoring.scorer import analyze_ticker
from app.services.universe.manager import get_active_universe

router = APIRouter(prefix="/stocks", tags=["stocks"])

_SYMBOL_RE = __import__("re").compile(r"^[A-Z0-9.\-]{1,10}$")


def _is_tracked_asset(symbol: str, db: Session) -> bool:
    """True when `symbol` is a real, tracked asset in the Asset Universe
    Manager (e.g. AAPL) — as opposed to a genuinely unrecognized string.
    Distinguishes "this asset exists but the current provider can't serve
    it right now" (503, honest degraded-service signal) from "this symbol
    doesn't exist" (404) — see the endpoints below.
    """
    return symbol.upper() in {a.symbol for a in get_active_universe(db)}


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
    except ProviderDataUnavailable as exc:
        if _is_tracked_asset(symbol, db):
            # A real, tracked asset the current provider can't serve right
            # now — let the app-level handler answer with the honest,
            # structured 503 it already produces for this exception type,
            # instead of masking a provider outage as a 404 "not found".
            raise
        raise HTTPException(status_code=404, detail=f"Could not deliberate on {symbol}: {exc}") from exc
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
def get_stock_analysis(symbol: str, db: Session = Depends(db_session)):
    try:
        return analyze_ticker(symbol)
    except ProviderDataUnavailable as exc:
        if _is_tracked_asset(symbol, db):
            raise
        raise HTTPException(status_code=404, detail=f"Could not analyze {symbol}: {exc}") from exc
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


_VALID_TIMEFRAMES = {"1m", "5m", "15m", "1H", "1D", "1W", "1M", "1Y", "ALL"}


@router.get("/{symbol}/candles")
async def get_stock_candles(
    symbol: str,
    timeframe: str = "1D",
    limit: int = 500,
    provider: MarketDataProvider = Depends(data_provider),
    db: Session = Depends(db_session),
):
    """Timeframe-aware candles for the trading chart. Backs every button in
    the chart's timeframe selector with the *real* data available for that
    granularity — see services/signals/engine.py's module docstring for the
    honesty rules this follows (intraday timeframes read the streaming
    service's real accumulated bars, never fabricated history; 1W/1M are a
    lossless resample of real daily bars).
    """
    from datetime import datetime, timezone

    from app.services.signals.engine import _INTRADAY_TIMEFRAMES, bars_for_timeframe, candle_provenance

    symbol = symbol.upper()
    if timeframe not in _VALID_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Unknown timeframe {timeframe!r}. Valid: {sorted(_VALID_TIMEFRAMES)}")

    try:
        provider.get_ticker_meta(symbol)
    except ProviderDataUnavailable as exc:
        if _is_tracked_asset(symbol, db):
            raise
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol!r}: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol!r}: {exc}") from exc

    if timeframe in _INTRADAY_TIMEFRAMES:
        from app.services.streaming.service import get_stream_service

        await get_stream_service().ensure_symbol(symbol)

    df = bars_for_timeframe(symbol, provider, timeframe)
    data_source, data_mode = candle_provenance(symbol, provider, timeframe)

    bars = [
        {
            "ts": ts.isoformat(),
            "open": round(float(row.open), 6),
            "high": round(float(row.high), 6),
            "low": round(float(row.low), 6),
            "close": round(float(row.close), 6),
            "volume": float(row.volume),
        }
        for ts, row in df.tail(limit).iterrows()
    ]

    note = None
    if timeframe in _INTRADAY_TIMEFRAMES and len(bars) < 30:
        note = (
            f"Only {len(bars)} bars of real live history accumulated on {symbol} so far this session — "
            "intraday history is not backfilled, only what has actually streamed."
        )

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "bars": bars,
        "bar_count": len(bars),
        "data_source": data_source,
        "data_mode": data_mode,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "note": note,
    }


_VALID_INDICATORS = {"sma", "ema", "rsi", "macd", "bollinger", "atr", "vwap"}


def _series_out(series) -> list[float | None]:
    """NaN (e.g. before a rolling window has enough bars) becomes `null`,
    never a fabricated number or a silently dropped point — the chart can
    render a gap exactly where the indicator genuinely isn't defined yet.
    """
    import math

    return [None if math.isnan(v) else round(float(v), 6) for v in series]


@router.get("/{symbol}/indicators")
def get_stock_indicators(
    symbol: str,
    timeframe: str = "1D",
    indicators: str = "sma,ema,rsi,macd,bollinger,atr,vwap",
    provider: MarketDataProvider = Depends(data_provider),
    db: Session = Depends(db_session),
):
    """Per-bar technical indicator series, aligned 1:1 with
    `/{symbol}/candles` at the same timeframe — chart overlay data. Reuses
    the exact same indicator math `services/scoring/scorer.py` already
    computes for scoring (`services/features/technical.py`), just returned
    as a full series instead of collapsed to a single latest value.
    """
    from app.services.features import technical
    from app.services.signals.engine import bars_for_timeframe

    symbol = symbol.upper()
    if timeframe not in _VALID_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Unknown timeframe {timeframe!r}. Valid: {sorted(_VALID_TIMEFRAMES)}")

    requested = {name.strip() for name in indicators.split(",") if name.strip()}
    unknown = requested - _VALID_INDICATORS
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown indicator(s) {sorted(unknown)}. Valid: {sorted(_VALID_INDICATORS)}")

    try:
        provider.get_ticker_meta(symbol)
    except ProviderDataUnavailable as exc:
        if _is_tracked_asset(symbol, db):
            raise
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol!r}: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol!r}: {exc}") from exc

    df = bars_for_timeframe(symbol, provider, timeframe)
    series: dict[str, list[float | None]] = {}

    if len(df) >= 2:
        if "sma" in requested:
            series["sma_20"] = _series_out(technical.sma(df["close"], 20))
            series["sma_50"] = _series_out(technical.sma(df["close"], 50))
        if "ema" in requested:
            series["ema_9"] = _series_out(technical.ema(df["close"], 9))
            series["ema_21"] = _series_out(technical.ema(df["close"], 21))
        if "rsi" in requested:
            series["rsi_14"] = _series_out(technical.rsi(df["close"], 14))
        if "macd" in requested:
            macd_df = technical.macd(df["close"])
            series["macd_line"] = _series_out(macd_df["macd"])
            series["macd_signal"] = _series_out(macd_df["signal"])
            series["macd_histogram"] = _series_out(macd_df["histogram"])
        if "bollinger" in requested:
            bb = technical.bollinger_bands(df["close"])
            series["bb_upper"] = _series_out(bb["upper"])
            series["bb_middle"] = _series_out(bb["mid"])
            series["bb_lower"] = _series_out(bb["lower"])
        if "atr" in requested:
            series["atr_14"] = _series_out(technical.atr(df, 14))
        if "vwap" in requested:
            series["vwap"] = _series_out(technical.vwap(df))

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "timestamps": [ts.isoformat() for ts in df.index],
        "series": series,
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
