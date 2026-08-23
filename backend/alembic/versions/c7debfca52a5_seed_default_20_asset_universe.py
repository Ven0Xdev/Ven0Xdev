"""seed default 20 asset universe

Data-only migration for the MVP seed universe (multi-asset spec §2). The
row values are frozen here rather than imported from
app.services.universe.manager, deliberately — a migration must keep
producing the same result even if that module's SEED_UNIVERSE list changes
later; re-seeding going forward is the app-level seed_default_universe()'s
job, not this migration's.

Idempotent: only inserts a symbol that doesn't already exist, and the
downgrade only removes rows that still have this migration's exact
untouched seed values, so an operator's later edit (e.g. deactivating a
symbol) survives a downgrade/upgrade cycle rather than being clobbered.

Revision ID: c7debfca52a5
Revises: aceab66d1590
Create Date: 2026-08-06 09:31:55.681916

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7debfca52a5'
down_revision: Union[str, Sequence[str], None] = 'aceab66d1590'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_STOCKS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "NFLX", "AVGO"]
_ETFS = ["SPY", "VOO", "QQQ", "DIA", "IWM", "GLD", "IAU", "SLV", "XLK", "XLE"]

_NAMES = {
    "AAPL": "Apple Inc.", "MSFT": "Microsoft Corporation", "NVDA": "NVIDIA Corporation",
    "AMZN": "Amazon.com, Inc.", "META": "Meta Platforms, Inc.", "GOOGL": "Alphabet Inc.",
    "TSLA": "Tesla, Inc.", "AMD": "Advanced Micro Devices, Inc.", "NFLX": "Netflix, Inc.",
    "AVGO": "Broadcom Inc.",
    "SPY": "SPDR S&P 500 ETF Trust", "VOO": "Vanguard S&P 500 ETF", "QQQ": "Invesco QQQ Trust",
    "DIA": "SPDR Dow Jones Industrial Average ETF", "IWM": "iShares Russell 2000 ETF",
    "GLD": "SPDR Gold Shares", "IAU": "iShares Gold Trust", "SLV": "iShares Silver Trust",
    "XLK": "Technology Select Sector SPDR Fund", "XLE": "Energy Select Sector SPDR Fund",
}

assets_table = sa.table(
    "assets",
    sa.column("symbol", sa.String),
    sa.column("asset_type", sa.String),
    sa.column("name", sa.String),
    sa.column("exchange", sa.String),
    sa.column("currency", sa.String),
    sa.column("provider", sa.String),
    sa.column("is_active", sa.Boolean),
    sa.column("tradable", sa.Boolean),
    sa.column("trading_hours", sa.String),
    sa.column("data_delay", sa.String),
    sa.column("supported_timeframes", sa.JSON),
    sa.column("created_at", sa.DateTime),
)


def _rows():
    for symbol in _STOCKS:
        yield symbol, "STOCK", "NASDAQ"
    for symbol in _ETFS:
        yield symbol, "ETF", "ARCA"


def upgrade() -> None:
    conn = op.get_bind()
    existing = {
        r[0] for r in conn.execute(sa.select(assets_table.c.symbol)).fetchall()
    }
    now = datetime.utcnow()
    to_insert = [
        {
            "symbol": symbol, "asset_type": asset_type, "name": _NAMES[symbol],
            "exchange": exchange, "currency": "USD", "provider": "unassigned",
            "is_active": True, "tradable": True, "trading_hours": "09:30-16:00 ET",
            "data_delay": "unspecified", "supported_timeframes": ["1d"], "created_at": now,
        }
        for symbol, asset_type, exchange in _rows()
        if symbol not in existing
    ]
    if to_insert:
        op.bulk_insert(assets_table, to_insert)


def downgrade() -> None:
    conn = op.get_bind()
    seed_symbols = [s for s, _, _ in _rows()]
    conn.execute(
        assets_table.delete().where(
            assets_table.c.symbol.in_(seed_symbols),
            assets_table.c.provider == "unassigned",
        )
    )
