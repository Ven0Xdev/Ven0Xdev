"""SEC EDGAR client — keyless, fair-use compliant.

EDGAR is the authoritative, free source for exactly the facts OTC data
vendors don't sell: share-count history (→ real dilution), filing cadence
(→ delinquency), and eventually going-concern language and insider forms.

Endpoints used (all public JSON, no API key):
- https://www.sec.gov/files/company_tickers.json         ticker → CIK map
- https://data.sec.gov/api/xbrl/companyfacts/CIK{10}.json XBRL company facts
- https://data.sec.gov/submissions/CIK{10}.json           filing history

Fair-use disciplines (https://www.sec.gov/os/accessing-edgar-data):
- A descriptive User-Agent identifying the application and a contact
  address is mandatory (configured via SEC_EDGAR_USER_AGENT).
- SEC allows up to 10 req/s; we self-limit to 5 req/s.
- Results are cached in-process; the ingester additionally persists to
  Postgres so the request path never touches sec.gov (architecture D7).

Honesty notes:
- Share counts come from the dei/us-gaap XBRL concepts as filed by the
  issuer. Missing concepts → fields stay None ("unknown"), never guessed.
- Delinquency is a documented heuristic: no 10-K/10-Q/20-F/40-F newer than
  DELINQUENCY_DAYS (150) → delinquent. 150 days is deliberately lenient
  (10-Qs are due ~40-45 days after quarter end) to keep false positives low.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

DELINQUENCY_DAYS = 150
_PERIODIC_FORMS = {"10-K", "10-Q", "20-F", "40-F", "10-K/A", "10-Q/A"}
_SHARE_CONCEPTS = (
    ("dei", "EntityCommonStockSharesOutstanding"),
    ("us-gaap", "CommonStockSharesOutstanding"),
    ("us-gaap", "CommonStockSharesIssued"),
)


@dataclass
class EdgarFacts:
    ticker: str
    cik: str
    shares_outstanding_latest: float | None
    shares_outstanding_year_ago: float | None
    dilution_12m_pct: float | None
    last_filing_date: datetime | None
    last_periodic_form: str | None
    filing_delinquent: bool | None


class _RateLimiter:
    def __init__(self, calls_per_second: float):
        self.min_interval = 1.0 / calls_per_second
        self.last = 0.0
        self.lock = threading.Lock()

    def acquire(self) -> None:
        with self.lock:
            wait = self.min_interval - (time.monotonic() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()


class EdgarClient:
    def __init__(
        self,
        user_agent: str,
        calls_per_second: float = 5.0,
        transport: httpx.BaseTransport | None = None,
    ):
        if not user_agent or "@" not in user_agent:
            logger.warning(
                "SEC_EDGAR_USER_AGENT should identify the app and include a contact email "
                "per SEC fair-use policy; current value: %r", user_agent
            )
        self._client = httpx.Client(
            headers={"User-Agent": user_agent, "Accept-Encoding": "gzip"},
            timeout=30.0,
            transport=transport,
            # SEC occasionally 301s between www.sec.gov/data.sec.gov; these
            # URLs carry no secrets, so bounded following is safe here.
            follow_redirects=True,
            max_redirects=3,
        )
        self._limiter = _RateLimiter(calls_per_second)
        self._cik_map: dict[str, str] | None = None
        self._cik_lock = threading.Lock()

    def _get_json(self, url: str) -> dict | list | None:
        self._limiter.acquire()
        response = self._client.get(url)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    # --- ticker → CIK ---------------------------------------------------
    def get_cik(self, ticker: str) -> str | None:
        ticker = ticker.upper()
        with self._cik_lock:
            if self._cik_map is None:
                payload = self._get_json("https://www.sec.gov/files/company_tickers.json") or {}
                self._cik_map = {
                    row["ticker"].upper(): str(row["cik_str"]).zfill(10)
                    for row in payload.values()
                }
        return self._cik_map.get(ticker)

    # --- share count history ---------------------------------------------
    def get_share_history(self, cik: str) -> list[tuple[datetime, float]]:
        """[(as-of date, shares outstanding)] ascending, from the first XBRL
        concept the issuer actually reports. Empty list = issuer files no
        usable share-count facts (common on Expert Market shells).
        """
        payload = self._get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")
        if not payload:
            return []
        facts = payload.get("facts", {})
        for taxonomy, concept in _SHARE_CONCEPTS:
            units = facts.get(taxonomy, {}).get(concept, {}).get("units", {})
            values = units.get("shares") or []
            points: dict[str, float] = {}
            for item in values:
                end = item.get("end")
                val = item.get("val")
                if end and val is not None:
                    points[end] = float(val)  # later filings win on same date
            if points:
                history = sorted(
                    (datetime.fromisoformat(d).replace(tzinfo=timezone.utc), v)
                    for d, v in points.items()
                )
                return history
        return []

    @staticmethod
    def compute_dilution_12m(history: list[tuple[datetime, float]], as_of: datetime | None = None) -> tuple[float | None, float | None, float | None]:
        """Returns (dilution_12m_pct, latest_shares, year_ago_shares).

        year-ago = the most recent observation at least ~11 months before
        the latest one (filings are quarterly; demanding exactly 365 days
        would spuriously return None). Negative dilution = share reduction.
        """
        if not history:
            return None, None, None
        latest_date, latest_val = history[-1]
        cutoff = latest_date - timedelta(days=335)
        older = [(d, v) for d, v in history if d <= cutoff]
        if not older or latest_val <= 0:
            return None, latest_val, None
        _, year_ago_val = older[-1]
        if year_ago_val <= 0:
            return None, latest_val, None
        return (latest_val / year_ago_val - 1) * 100, latest_val, year_ago_val

    # --- filings ----------------------------------------------------------
    def get_filing_status(self, cik: str) -> tuple[datetime | None, str | None, bool | None]:
        """(last periodic filing date, its form type, delinquent?) from the
        submissions API. (None, None, None) = no filing history found.
        """
        payload = self._get_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
        if not payload:
            return None, None, None
        recent = payload.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])

        last_periodic: tuple[datetime, str] | None = None
        for form, date_str in zip(forms, dates):
            if form in _PERIODIC_FORMS:
                filed = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                if last_periodic is None or filed > last_periodic[0]:
                    last_periodic = (filed, form)

        if last_periodic is None:
            # Files with SEC but never a periodic report → treat as delinquent-equivalent.
            return None, None, True

        filed, form = last_periodic
        delinquent = (datetime.now(timezone.utc) - filed).days > DELINQUENCY_DAYS
        return filed, form, delinquent

    # --- one-call summary ---------------------------------------------------
    def fetch_facts(self, ticker: str) -> EdgarFacts | None:
        """Full EDGAR fact set for a ticker, or None if the ticker has no
        CIK (not SEC-registered — itself a meaningful signal for OTC).
        """
        cik = self.get_cik(ticker)
        if cik is None:
            return None
        history = self.get_share_history(cik)
        dilution, latest, year_ago = self.compute_dilution_12m(history)
        last_filing, last_form, delinquent = self.get_filing_status(cik)
        return EdgarFacts(
            ticker=ticker.upper(),
            cik=cik,
            shares_outstanding_latest=latest,
            shares_outstanding_year_ago=year_ago,
            dilution_12m_pct=dilution,
            last_filing_date=last_filing,
            last_periodic_form=last_form,
            filing_delinquent=delinquent,
        )
