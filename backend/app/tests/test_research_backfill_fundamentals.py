"""services/research/backfill_fundamentals.py — point-in-time EDGAR
fundamentals backfill. Proves the real bug caught on this backfill's
first live run against actual EDGAR data: XBRL frames genuinely repeat
the same (concept, period_end, filed_date) fact (a historical quarter
re-appearing as a comparative column in a later filing sharing that
later filing's own `filed` date), which must collapse to one row rather
than violating the table's identity constraint."""
from app.db.models.point_in_time_fundamental import PointInTimeFundamental
from app.services.research.backfill_fundamentals import run_fundamentals_backfill

SYMBOL = "DEDUPTEST"


class _FakeClient:
    def __init__(self, facts: list[dict]):
        self._facts = facts

    def get_cik(self, ticker: str) -> str:
        return "0000000001"

    def get_point_in_time_facts(self, cik: str) -> list[dict]:
        return self._facts


def _fact(concept="Revenues", period_end="2016-09-24", filed="2018-11-05", value=100.0, form="10-K", period_start="2015-09-27"):
    return {
        "taxonomy": "us-gaap", "concept": concept, "unit": "USD",
        "period_start": period_start, "period_end": period_end, "filed": filed, "form": form, "value": value,
    }


def test_duplicate_identity_tuples_from_repeated_xbrl_frames_collapse_to_one_row(db_session):
    facts = [_fact(), _fact(), _fact()]  # the exact real-world case: identical identity, repeated
    client = _FakeClient(facts)

    report = run_fundamentals_backfill(db_session, client, [SYMBOL])

    assert report[SYMBOL]["status"] == "done"
    rows = db_session.query(PointInTimeFundamental).filter_by(ticker_symbol=SYMBOL).all()
    assert len(rows) == 1
    assert rows[0].value == 100.0


def test_genuinely_distinct_facts_are_all_kept(db_session):
    facts = [
        _fact(concept="Revenues", period_end="2016-09-24", filed="2018-11-05", value=100.0),
        _fact(concept="NetIncomeLoss", period_end="2016-09-24", filed="2018-11-05", value=20.0),
        _fact(concept="Revenues", period_end="2017-09-30", filed="2018-11-05", value=110.0),
    ]
    client = _FakeClient(facts)

    run_fundamentals_backfill(db_session, client, [SYMBOL])

    rows = db_session.query(PointInTimeFundamental).filter_by(ticker_symbol=SYMBOL).all()
    assert len(rows) == 3


def test_a_symbol_with_no_cik_is_recorded_done_with_zero_rows_not_an_error(db_session):
    class _NoCikClient(_FakeClient):
        def get_cik(self, ticker: str):
            return None

    report = run_fundamentals_backfill(db_session, _NoCikClient([]), ["ETFNOFACTS"])
    assert report["ETFNOFACTS"]["status"] == "done"
    assert report["ETFNOFACTS"]["rows_inserted"] == 0
    assert "not SEC-registered" in report["ETFNOFACTS"]["note"]
