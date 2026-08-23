"""Optional OTC/micro-cap module — disabled by default (see
app.core.config.Settings.otc_module_enabled).

Nexora's main experience covers mainstream STOCK/ETF/INDEX/COMMODITY/
PRECIOUS_METAL assets through the Asset Universe Manager
(services/universe/manager.py). This package holds the OTC-only logic that
does not apply to that mainstream universe — toxic/dilutive financing
detection, promotional-news detection, reverse-split-cycle analysis, and
(via services/data_providers/mock_provider.py's MockOTCProvider,
db/models/market.py's Ticker table, and app/workers/scan_scheduler.py) the
original OTC penny-stock scanner. None of this code was deleted; it is
isolated here (or left in its original module but gated off) so it can be
re-enabled for a future OTC product surface without being part of the
mainstream platform's default behavior.
"""
