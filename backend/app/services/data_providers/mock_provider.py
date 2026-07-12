"""Deterministic synthetic OTC market data provider.

Real OTC market data (Level II quotes, SEC EDGAR filings, OTC Markets
disclosures, licensed news/sentiment feeds) requires paid API keys that this
sandbox does not have. This provider generates *statistically realistic*
penny-stock behavior (regimes: clean uptrend, clean downtrend, accumulation
breakout, pump-and-dump, choppy/illiquid) seeded deterministically per symbol
so the whole platform is runnable and demoable end-to-end without external
dependencies, and so unit tests are reproducible.

Swap `market_data_provider=polygon|finnhub|otc_markets` in `.env` (with the
matching API key) to point the exact same downstream pipeline at live data.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from app.services.data_providers.base import (
    CorporateAction,
    Fundamentals,
    MarketDataProvider,
    NewsArticle,
    Quote,
    TickerMeta,
)

_SECTORS = ["Biotech", "Mining & Metals", "Cannabis", "Technology", "Energy", "Financial Shell", "Consumer Goods"]
_REGIMES = ["clean_uptrend", "clean_downtrend", "accumulation_breakout", "pump_dump", "choppy_illiquid"]

_UNIVERSE_SYMBOLS = [
    "AXNT", "BLKM", "CRVX", "DYNP", "EVOL", "FRTX", "GRNH", "HLXA", "IONQ2", "JUVA",
    "KLTR", "LUMX", "MNRL", "NOVX", "OZMR", "PLSM", "QNTA", "RSGX", "SOLR2", "TVIX2",
    "UMBR", "VRTC", "WLLX", "XRGN", "YLDN", "ZPHR", "ACLR", "BNVX", "CBDX", "DRNX",
]


def _seed_for(symbol: str) -> int:
    return int(hashlib.sha256(symbol.encode()).hexdigest(), 16) % (2**32)


def _regime_for(symbol: str) -> str:
    return _REGIMES[_seed_for(symbol) % len(_REGIMES)]


class MockOTCProvider(MarketDataProvider):
    name = "mock"
    data_mode = "synthetic"

    def __init__(self) -> None:
        self._universe = [self._build_meta(sym) for sym in _UNIVERSE_SYMBOLS]
        self._universe_by_symbol = {t.symbol: t for t in self._universe}

    # --- universe / meta -------------------------------------------------
    def _build_meta(self, symbol: str) -> TickerMeta:
        rng = np.random.default_rng(_seed_for(symbol))
        regime = _regime_for(symbol)
        float_shares = float(rng.uniform(2_000_000, 400_000_000))
        shares_out = float(float_shares * rng.uniform(1.0, 1.6))
        price_guess = float(rng.uniform(0.001, 6.0))
        market_cap = shares_out * price_guess
        reverse_splits = int(rng.poisson(1.2)) if regime in ("pump_dump", "choppy_illiquid") else int(rng.poisson(0.2))
        return TickerMeta(
            symbol=symbol,
            company_name=f"{symbol.title()} Holdings Inc.",
            tier=rng.choice(["Pink", "PinkLimited", "Expert", "QX", "QB"], p=[0.35, 0.15, 0.15, 0.15, 0.2]),
            sector=_SECTORS[_seed_for(symbol) % len(_SECTORS)],
            industry="Diversified",
            float_shares=float_shares,
            shares_outstanding=shares_out,
            market_cap=market_cap,
            reverse_split_count_3y=reverse_splits,
            institutional_ownership_pct=float(rng.uniform(0, 12)),
            insider_ownership_pct=float(rng.uniform(2, 55)),
            short_interest_pct=float(rng.uniform(0, 8)),
        )

    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        return self._universe[:limit] if limit else list(self._universe)

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        """Unknown symbols are unknown — even in synthetic mode. Fabricating
        a company for an arbitrary string is fabricated financial data
        (audit finding P0-2), so the mock validates against its universe
        exactly like a real vendor validates against the market.
        """
        symbol = symbol.upper()
        meta = self._universe_by_symbol.get(symbol)
        if meta is None:
            from app.services.data_providers.http_base import ProviderDataUnavailable

            raise ProviderDataUnavailable(
                f"Unknown symbol {symbol!r} — not in the synthetic universe. "
                f"(The mock provider never invents companies for unrecognized tickers.)"
            )
        return meta

    # --- OHLCV -------------------------------------------------------------
    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        symbol = symbol.upper()
        rng = np.random.default_rng(_seed_for(symbol) ^ 0xA5A5)
        regime = _regime_for(symbol)
        n = max(lookback_days, 40)

        start_price = float(rng.uniform(0.05, 4.0))
        drift, vol, pump_day = self._regime_params(regime, n, rng)

        log_returns = rng.normal(drift, vol, n)
        volumes = np.abs(rng.normal(1.0, 0.4, n)) * rng.uniform(50_000, 3_000_000)

        if regime == "pump_dump" and pump_day is not None:
            ramp = np.linspace(0.01, 0.35, 6)
            for i, bump in enumerate(ramp):
                idx = pump_day - len(ramp) + i
                if 0 <= idx < n:
                    log_returns[idx] += bump
                    volumes[idx] *= rng.uniform(4, 12)
            dump = np.linspace(-0.4, -0.05, 8)
            for i, bump in enumerate(dump):
                idx = pump_day + i
                if 0 <= idx < n:
                    log_returns[idx] += bump
                    volumes[idx] *= rng.uniform(3, 8)

        prices = start_price * np.exp(np.cumsum(log_returns))
        prices = np.clip(prices, 0.0001, None)

        closes = prices
        opens = np.roll(closes, 1)
        opens[0] = start_price
        intraday_range = np.abs(rng.normal(0.02, 0.015, n)) * closes
        highs = np.maximum(opens, closes) + intraday_range
        lows = np.clip(np.minimum(opens, closes) - intraday_range, 0.0001, None)

        spread_pct = 0.08 if regime == "choppy_illiquid" else 0.02
        bids = closes * (1 - spread_pct / 2)
        asks = closes * (1 + spread_pct / 2)

        end = datetime.now(timezone.utc).replace(hour=20, minute=0, second=0, microsecond=0)
        dates = pd.bdate_range(end=end, periods=n, freq="C")

        df = pd.DataFrame(
            {
                "open": opens,
                "high": highs,
                "low": lows,
                "close": closes,
                "volume": volumes,
                "bid": bids,
                "ask": asks,
            },
            index=pd.DatetimeIndex(dates, name="ts"),
        )
        return df

    @staticmethod
    def _regime_params(regime: str, n: int, rng: np.random.Generator) -> tuple[float, float, int | None]:
        if regime == "clean_uptrend":
            return 0.006, 0.035, None
        if regime == "clean_downtrend":
            return -0.006, 0.035, None
        if regime == "accumulation_breakout":
            return 0.002, 0.025, None
        if regime == "choppy_illiquid":
            return 0.0, 0.06, None
        if regime == "pump_dump":
            pump_day = int(rng.integers(int(n * 0.55), int(n * 0.85)))
            return 0.0005, 0.04, pump_day
        return 0.0, 0.03, None

    # --- quotes --------------------------------------------------------
    def get_quote(self, symbol: str) -> Quote:
        df = self.get_ohlcv(symbol, lookback_days=5)
        last_row = df.iloc[-1]
        return Quote(
            symbol=symbol.upper(),
            last=float(last_row["close"]),
            bid=float(last_row["bid"]),
            ask=float(last_row["ask"]),
            bid_size=float(np.random.default_rng(_seed_for(symbol)).uniform(500, 20000)),
            ask_size=float(np.random.default_rng(_seed_for(symbol) + 1).uniform(500, 20000)),
            timestamp=datetime.now(timezone.utc),
        )

    # --- fundamentals -----------------------------------------------------
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        meta = self.get_ticker_meta(symbol)
        rng = np.random.default_rng(_seed_for(symbol) ^ 0x1234)
        regime = _regime_for(symbol)
        cash = float(rng.uniform(10_000, 5_000_000))
        debt = float(rng.uniform(0, 8_000_000))
        revenue = float(rng.uniform(0, 20_000_000))
        net_income = revenue * rng.uniform(-2.5, 0.15)
        dilution = float(rng.uniform(0, 15)) if regime != "pump_dump" else float(rng.uniform(20, 120))
        return Fundamentals(
            symbol=symbol.upper(),
            market_cap=meta.market_cap,
            float_shares=meta.float_shares,
            shares_outstanding=meta.shares_outstanding,
            cash=cash,
            total_debt=debt,
            revenue_ttm=revenue,
            net_income_ttm=net_income,
            dilution_12m_pct=dilution,
            going_concern_flag=bool(cash < debt * 0.3 and rng.random() < 0.6),
            last_filing_date=datetime.now(timezone.utc) - timedelta(days=int(rng.uniform(10, 400))),
            filing_delinquent=bool(rng.random() < (0.35 if regime == "pump_dump" else 0.08)),
        )

    # --- news --------------------------------------------------------------
    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        rng = np.random.default_rng(_seed_for(symbol) ^ 0x9E9E)
        regime = _regime_for(symbol)
        templates = [
            ("Company announces uplisting application progress", 0.4, False, False),
            ("Quarterly results released", 0.1, True, False),
            ("New strategic partnership announced", 0.5, True, False),
            ("Management provides corporate update", 0.2, True, False),
            ("Featured in promotional stock alert newsletter", 0.6, False, True),
            ("Company completes registered direct offering", -0.5, True, False),
            ("Analyst-style hype article: '10x potential penny stock'", 0.7, False, True),
            ("Going concern doubt disclosed in filing", -0.7, True, False),
            ("Reverse stock split effective", -0.3, True, False),
        ]
        n = min(limit, len(templates))
        picks = rng.choice(len(templates), size=n, replace=False)
        articles = []
        now = datetime.now(timezone.utc)
        for i, idx in enumerate(picks):
            headline, base_sent, is_pr, is_promo = templates[idx]
            sentiment = float(np.clip(base_sent + rng.normal(0, 0.15), -1, 1))
            if regime == "pump_dump":
                is_promo = is_promo or bool(rng.random() < 0.4)
            articles.append(
                NewsArticle(
                    symbol=symbol.upper(),
                    published_at=now - timedelta(days=int(i * rng.uniform(1, 6))),
                    source="PR Newswire" if is_pr else "StockAlerts Daily",
                    headline=f"{symbol.upper()}: {headline}",
                    url=f"https://example-newsfeed.local/{symbol.lower()}/{i}",
                    sentiment=sentiment,
                    is_press_release=is_pr,
                    is_promotional=is_promo,
                )
            )
        return sorted(articles, key=lambda a: a.published_at, reverse=True)

    # --- corporate actions ----------------------------------------------
    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        meta = self.get_ticker_meta(symbol)
        actions: list[CorporateAction] = []
        now = datetime.now(timezone.utc)
        for i in range(meta.reverse_split_count_3y):
            actions.append(
                CorporateAction(
                    symbol=symbol.upper(),
                    date=now - timedelta(days=180 * (i + 1)),
                    action_type="reverse_split",
                    details={"ratio": f"1:{[10, 20, 50, 100][i % 4]}"},
                )
            )
        return actions


from app.services.data_providers.registry import register_provider  # noqa: E402


@register_provider("mock")
def _build_mock(settings) -> MockOTCProvider:
    return MockOTCProvider()
