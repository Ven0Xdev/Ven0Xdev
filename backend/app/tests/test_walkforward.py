"""Walk-forward validation: temporal discipline + calibration reporting."""
from app.services.backtest.walkforward import run_walk_forward_validation
from app.services.data_providers.mock_provider import MockOTCProvider


def test_walk_forward_produces_folds_and_calibration():
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=5)]
    report = run_walk_forward_validation(provider, symbols, n_folds=2, lookback_days=250)

    assert report["n_folds"] == 2
    assert len(report["folds"]) == 2
    for fold in report["folds"]:
        assert fold["train_rows"] >= 0 and fold["test_rows"] >= 0

    aggregate = report["aggregate_out_of_sample"]
    assert aggregate, "aggregate out-of-sample section must exist"
    for entry in aggregate.values():
        assert entry["test_rows"] > 0
        assert 0 <= entry["positive_rate"] <= 1
        buckets = entry["calibration"]
        assert buckets
        for bucket in buckets:
            if bucket.get("count", 0) > 0:
                assert 0 <= bucket["realized_frequency"] <= 1


def test_walk_forward_trains_only_on_past():
    # Structural check: fold k's training row count is non-decreasing in k
    # (expanding window over time).
    provider = MockOTCProvider()
    symbols = [t.symbol for t in provider.get_universe(limit=4)]
    report = run_walk_forward_validation(provider, symbols, n_folds=3, lookback_days=250)
    train_counts = [f["train_rows"] for f in report["folds"]]
    assert train_counts == sorted(train_counts)
