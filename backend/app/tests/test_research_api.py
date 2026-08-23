"""app/api/v1/endpoints/research.py — the Historical Research dashboard's
API surface. Smoke-level: every route wires up, read endpoints work for
a plain authenticated user, and the Canary status endpoint never lies
about being enabled by default. Uses only the `client` fixture (never
combined with `db_session` in the same test — they're independently-
scoped sessions on a shared StaticPool connection; see conftest.py's own
`client` fixture docstring for why mixing them risks a transaction
conflict). services/research/registry.py's own test file
(test_research_registry.py) already covers qualify_candidate()'s
persisted-row shape directly against `db_session`."""


def test_coverage_endpoint_returns_honest_empty_state_with_no_data(client):
    res = client.get("/api/v1/research/coverage")
    assert res.status_code == 200
    body = res.json()
    assert body["bars"] == []
    assert body["news_honestly_unavailable"] is True
    assert "30m" in body["horizons"]


def test_models_list_is_empty_until_something_is_trained(client):
    res = client.get("/api/v1/research/models")
    assert res.status_code == 200
    assert res.json() == []


def test_model_detail_404s_for_an_unknown_id(client):
    res = client.get("/api/v1/research/models/999999")
    assert res.status_code == 404


def test_canary_status_defaults_to_disabled_and_not_auto_paused(client):
    res = client.get("/api/v1/research/canary/status")
    assert res.status_code == 200
    body = res.json()
    assert body["enabled"] is False
    assert body["auto_paused"] is False
    assert body["open_positions"] == []
