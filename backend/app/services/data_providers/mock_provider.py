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
from app.services.universe.manager import SEED_NAMES, SEED_UNIVERSE

_SECTORS = ["Biotech", "Mining & Metals", "Cannabis", "Technology", "Energy", "Financial Shell", "Consumer Goods"]
_REGIMES = ["clean_uptrend", "clean_downtrend", "accumulation_breakout", "pump_dump", "choppy_illiquid"]

_UNIVERSE_SYMBOLS = [
    "AXNT", "BLKM", "CRVX", "DYNP", "EVOL", "FRTX", "GRNH", "HLXA", "IONQ2", "JUVA",
    "KLTR", "LUMX", "MNRL", "NOVX", "OZMR", "PLSM", "QNTA", "RSGX", "SOLR2", "TVIX2",
    "UMBR", "VRTC", "WLLX", "XRGN", "YLDN", "ZPHR", "ACLR", "BNVX", "CBDX", "DRNX",
]

# --- Multi-asset (canonical universe) synthetic profiles --------------------
#
# The Asset Universe Manager's canonical universe (services/universe/manager.
# SEED_UNIVERSE — 10 mainstream large-cap stocks + 10 broad/sector/precious-
# metal ETFs, the set backing /scan/opportunities, /scan/heatmap,
# /scan/risk-monitor and /scan/multi-asset/prescan) is a completely different
# symbol set from this provider's own 30-ticker OTC penny-stock universe
# above. Historically get_ticker_meta() only recognized the OTC set, so
# every single canonical symbol (not just XLK) failed with "Unknown symbol"
# the moment the mock provider backed those endpoints — see
# OPPORTUNITIES_XLK_FIX.md. Real vendors (Polygon/Finnhub/etc.) obviously
# know both AAPL and OTC micro-caps; the synthetic provider must too, while
# still refusing anything outside *either* known set (requirement: never
# fabricate a company for a truly unrecognized ticker).
#
# Distinct generation parameters from the OTC set above are deliberate, not
# copy-paste: real mega-cap stocks/ETFs do not trade at $0.05-$4 with
# pump-and-dump regimes — using the same penny-stock model here would be its
# own kind of fabricated, misleading demo data. price_range/daily_vol below
# are coarse, plausible mid-2020s anchors for demo purposes only — never
# real-time quotes (data_mode stays "synthetic" for every symbol from this
# provider, same as the OTC set).
_MULTI_ASSET_PROFILES: dict[str, dict] = {
    "AAPL": {"price_range": (170, 260), "daily_vol": 0.018, "shares_out": 15_100_000_000, "sector": "Technology"},
    "MSFT": {"price_range": (380, 480), "daily_vol": 0.016, "shares_out": 7_430_000_000, "sector": "Technology"},
    "NVDA": {"price_range": (100, 160), "daily_vol": 0.028, "shares_out": 24_500_000_000, "sector": "Technology"},
    "AMZN": {"price_range": (165, 230), "daily_vol": 0.020, "shares_out": 10_400_000_000, "sector": "Consumer Discretionary"},
    "META": {"price_range": (430, 650), "daily_vol": 0.024, "shares_out": 2_540_000_000, "sector": "Communication Services"},
    "GOOGL": {"price_range": (140, 200), "daily_vol": 0.019, "shares_out": 12_100_000_000, "sector": "Communication Services"},
    "TSLA": {"price_range": (180, 360), "daily_vol": 0.035, "shares_out": 3_190_000_000, "sector": "Consumer Discretionary"},
    "AMD": {"price_range": (110, 190), "daily_vol": 0.030, "shares_out": 1_620_000_000, "sector": "Technology"},
    "NFLX": {"price_range": (550, 950), "daily_vol": 0.022, "shares_out": 430_000_000, "sector": "Communication Services"},
    "AVGO": {"price_range": (140, 230), "daily_vol": 0.021, "shares_out": 4_700_000_000, "sector": "Technology"},
    "SPY": {"price_range": (480, 620), "daily_vol": 0.009, "shares_out": 930_000_000, "sector": "Broad Market ETF"},
    "VOO": {"price_range": (440, 570), "daily_vol": 0.009, "shares_out": 900_000_000, "sector": "Broad Market ETF"},
    "QQQ": {"price_range": (380, 520), "daily_vol": 0.013, "shares_out": 610_000_000, "sector": "Broad Market ETF"},
    "DIA": {"price_range": (370, 440), "daily_vol": 0.009, "shares_out": 90_000_000, "sector": "Broad Market ETF"},
    "IWM": {"price_range": (180, 230), "daily_vol": 0.015, "shares_out": 260_000_000, "sector": "Broad Market ETF"},
    "GLD": {"price_range": (180, 270), "daily_vol": 0.011, "shares_out": 320_000_000, "sector": "Precious Metal ETF"},
    "IAU": {"price_range": (36, 56), "daily_vol": 0.011, "shares_out": 620_000_000, "sector": "Precious Metal ETF"},
    "SLV": {"price_range": (20, 32), "daily_vol": 0.017, "shares_out": 470_000_000, "sector": "Precious Metal ETF"},
    "XLK": {"price_range": (190, 260), "daily_vol": 0.016, "shares_out": 590_000_000, "sector": "Technology Sector ETF"},
    "XLE": {"price_range": (75, 100), "daily_vol": 0.018, "shares_out": 550_000_000, "sector": "Energy Sector ETF"},
}

_MULTI_ASSET_REGIMES = ["uptrend", "downtrend", "range_bound"]

_MULTI_ASSET_NEWS_TEMPLATES = [
    ("Quarterly earnings beat analyst estimates", 0.5, True, False),
    ("Quarterly earnings miss analyst estimates", -0.4, True, False),
    ("Board authorizes expanded share buyback program", 0.4, True, False),
    ("Company raises quarterly dividend", 0.3, True, False),
    ("Analyst upgrades rating and price target", 0.4, False, False),
    ("Analyst downgrades rating on valuation concerns", -0.3, False, False),
    ("New product line announced at industry event", 0.3, True, False),
    ("Regulatory scrutiny reported in key market", -0.3, False, False),
]

# Every canonical symbol must have a profile — this assertion protects
# against the exact class of bug this dict exists to fix: silently drifting
# out of sync with services/universe/manager.SEED_UNIVERSE again.
assert set(_MULTI_ASSET_PROFILES) == {e["symbol"] for e in SEED_UNIVERSE}, (
    "MockOTCProvider._MULTI_ASSET_PROFILES is out of sync with "
    "services.universe.manager.SEED_UNIVERSE — every canonical asset must "
    "have a synthetic profile."
)


def _seed_for(symbol: str) -> int:
    return int(hashlib.sha256(symbol.encode()).hexdigest(), 16) % (2**32)


def _regime_for(symbol: str) -> str:
    return _REGIMES[_seed_for(symbol) % len(_REGIMES)]


def _regime_for_multi_asset(symbol: str) -> str:
    return _MULTI_ASSET_REGIMES[_seed_for(symbol) % len(_MULTI_ASSET_REGIMES)]


class MockOTCProvider(MarketDataProvider):
    name = "mock"
    data_mode = "synthetic"

    def __init__(self) -> None:
        self._universe = [self._build_meta(sym) for sym in _UNIVERSE_SYMBOLS]
        self._universe_by_symbol = {t.symbol: t for t in self._universe}
        # Kept separate from get_universe()/self._universe: the canonical
        # multi-asset universe is the Asset Universe Manager's own concern
        # (services/universe/manager.get_active_universe), not this
        # provider's get_universe() — every existing OTC-scanner test and
        # caller asserts get_universe() is exactly the 30-ticker OTC set.
        # This dict only backs symbol-keyed lookups (get_ticker_meta and
        # everything that calls it) so AAPL/XLK/etc. resolve too.
        self._multi_asset_by_symbol = {
            sym: self._build_multi_asset_meta(sym) for sym in _MULTI_ASSET_PROFILES
        }

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

    def _build_multi_asset_meta(self, symbol: str) -> TickerMeta:
        """Synthetic metadata for a canonical multi-asset symbol (real
        mainstream stock/ETF, not an OTC penny ticker) — see
        _MULTI_ASSET_PROFILES' module-level docstring for why this uses
        different generation parameters than _build_meta() above."""
        profile = _MULTI_ASSET_PROFILES[symbol]
        rng = np.random.default_rng(_seed_for(symbol) ^ 0x4A55)
        lo, hi = profile["price_range"]
        price_guess = float(rng.uniform(lo, hi))
        shares_out = float(profile["shares_out"])
        # Mega-caps/broad ETFs trade almost entirely float — no founder
        # lock-ups or shell-style concentration the way OTC penny stocks do.
        float_shares = float(shares_out * rng.uniform(0.92, 0.995))
        return TickerMeta(
            symbol=symbol,
            company_name=SEED_NAMES[symbol],
            tier="NMS",
            sector=profile["sector"],
            industry=profile["sector"],
            float_shares=float_shares,
            shares_outstanding=shares_out,
            market_cap=shares_out * price_guess,
            reverse_split_count_3y=0,
            institutional_ownership_pct=float(rng.uniform(55, 85)),
            insider_ownership_pct=float(rng.uniform(0.1, 5)),
            short_interest_pct=float(rng.uniform(0.3, 4)),
        )

    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        return self._universe[:limit] if limit else list(self._universe)

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        """Unknown symbols are unknown — even in synthetic mode. Fabricating
        a company for an arbitrary string is fabricated financial data
        (audit finding P0-2), so the mock validates against its universe
        exactly like a real vendor validates against the market. "Its
        universe" is two known sets: the legacy 30-ticker OTC universe above,
        and the canonical multi-asset universe (services.universe.manager.
        SEED_UNIVERSE) — anything outside both still fails, unchanged.
        """
        symbol = symbol.upper()
        meta = self._universe_by_symbol.get(symbol) or self._multi_asset_by_symbol.get(symbol)
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
        n = max(lookback_days, 40)
        is_multi_asset = symbol in _MULTI_ASSET_PROFILES

        # RNG draw order below matters — it must stay byte-identical to the
        # pre-multi-asset code for the `else` (OTC) branch, or every
        # existing OTC symbol's deterministic price series silently shifts
        # (caught by test_paper_trading.py's hardcoded BLKM/AXNT fixtures).
        if is_multi_asset:
            profile = _MULTI_ASSET_PROFILES[symbol]
            regime = _regime_for_multi_asset(symbol)
            lo, hi = profile["price_range"]
            start_price = float(rng.uniform(lo, hi))
            drift, vol, pump_day = self._regime_params_multi_asset(regime, profile["daily_vol"])
            log_returns = rng.normal(drift, vol, n)
            # Liquid mega-caps/broad ETFs: heavy, steady daily share volume —
            # nowhere near an OTC penny stock's thin, spiky volume profile.
            volumes = np.abs(rng.normal(1.0, 0.15, n)) * rng.uniform(3_000_000, 60_000_000)
        else:
            regime = _regime_for(symbol)
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
        range_mean = 0.008 if is_multi_asset else 0.02
        intraday_range = np.abs(rng.normal(range_mean, range_mean * 0.75, n)) * closes
        highs = np.maximum(opens, closes) + intraday_range
        lows = np.clip(np.minimum(opens, closes) - intraday_range, 0.0001, None)

        if is_multi_asset:
            spread_pct = 0.0004  # liquid mega-cap/ETF — a fraction of a cent on the dollar
        else:
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

    @staticmethod
    def _regime_params_multi_asset(regime: str, daily_vol: float) -> tuple[float, float, int | None]:
        """Mainstream stock/ETF regimes — deliberately excludes pump_dump:
        a pump-and-dump signature on AAPL or SPY would itself be fabricated,
        misleading demo data, not a plausible large-cap pattern."""
        if regime == "uptrend":
            return 0.0006, daily_vol, None
        if regime == "downtrend":
            return -0.0006, daily_vol, None
        return 0.0, daily_vol * 0.85, None  # range_bound

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
        symbol = symbol.upper()
        if symbol in _MULTI_ASSET_PROFILES:
            return self._get_fundamentals_multi_asset(symbol, meta)
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

    def _get_fundamentals_multi_asset(self, symbol: str, meta: TickerMeta) -> Fundamentals:
        """Mega-cap/ETF-scale fundamentals: solvent, disciplined, current on
        filings by construction — a going-concern doubt or delinquent filer
        flag on AAPL or SPY would itself be fabricated, misleading data, the
        same reasoning as excluding pump_dump from get_ohlcv() above. ETFs
        have no traditional revenue/earnings — left at 0 rather than
        inventing fund-level numbers that don't correspond to anything real."""
        rng = np.random.default_rng(_seed_for(symbol) ^ 0x1234)
        is_etf = meta.sector.endswith("ETF")
        cash = float(rng.uniform(5_000_000_000, 80_000_000_000))
        debt = float(rng.uniform(1_000_000_000, 60_000_000_000))
        if is_etf:
            revenue = 0.0
            net_income = 0.0
        else:
            revenue = float(rng.uniform(20_000_000_000, 400_000_000_000))
            net_income = revenue * rng.uniform(0.10, 0.30)
        return Fundamentals(
            symbol=symbol,
            market_cap=meta.market_cap,
            float_shares=meta.float_shares,
            shares_outstanding=meta.shares_outstanding,
            cash=cash,
            total_debt=debt,
            revenue_ttm=revenue,
            net_income_ttm=net_income,
            dilution_12m_pct=float(rng.uniform(0, 1.5)),
            going_concern_flag=False,
            last_filing_date=datetime.now(timezone.utc) - timedelta(days=int(rng.uniform(5, 85))),
            filing_delinquent=False,
        )

    # --- news --------------------------------------------------------------
    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        symbol = symbol.upper()
        rng = np.random.default_rng(_seed_for(symbol) ^ 0x9E9E)
        if symbol in _MULTI_ASSET_PROFILES:
            return self._get_news_multi_asset(symbol, limit, rng)
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

    def _get_news_multi_asset(self, symbol: str, limit: int, rng: np.random.Generator) -> list[NewsArticle]:
        """Mainstream-appropriate headlines (earnings, buybacks, analyst
        actions) — the OTC templates above (going-concern doubt, reverse
        splits, promotional newsletters) don't apply to a mega-cap/ETF and
        would read as fabricated if attached to one."""
        n = min(limit, len(_MULTI_ASSET_NEWS_TEMPLATES))
        picks = rng.choice(len(_MULTI_ASSET_NEWS_TEMPLATES), size=n, replace=False)
        articles = []
        now = datetime.now(timezone.utc)
        for i, idx in enumerate(picks):
            headline, base_sent, is_pr, is_promo = _MULTI_ASSET_NEWS_TEMPLATES[idx]
            sentiment = float(np.clip(base_sent + rng.normal(0, 0.1), -1, 1))
            articles.append(
                NewsArticle(
                    symbol=symbol,
                    published_at=now - timedelta(days=int(i * rng.uniform(1, 6))),
                    source="PR Newswire" if is_pr else "MarketWire Daily",
                    headline=f"{symbol}: {headline}",
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
