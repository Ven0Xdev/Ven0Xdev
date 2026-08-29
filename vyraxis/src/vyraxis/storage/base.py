"""Declarative base and shared column conventions."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar, Final

from sqlalchemy import CheckConstraint, Enum, MetaData, Numeric, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase

#: Deterministic constraint names. Without this, Alembic emits unnamed
#: constraints that cannot be dropped by a later migration.
NAMING_CONVENTION: Final[dict[str, str]] = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

#: Base58 addresses are 32..44 characters; signatures up to 88.
ADDRESS_LEN: Final[int] = 44
SIGNATURE_LEN: Final[int] = 96

#: Integer base units of an SPL token. u64 max is 20 digits; 40 leaves room for
#: aggregates without overflow.
RawAmount = Numeric(40, 0)
#: Human-scaled token quantity.
Qty = Numeric(40, 18)
#: Price, small enough for sub-nano memecoin quotes.
Price = Numeric(40, 20)
#: USD-denominated value.
Usd = Numeric(28, 10)

#: All timestamps are stored WITH TIME ZONE and written as UTC.
UtcTimestamp = TIMESTAMP(timezone=True)

Json = JSONB


def string_enum(enum_cls: type, name: str) -> Enum:
    """Persist a Python ``StrEnum`` as VARCHAR plus a CHECK constraint."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        length=32,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda cls: [member.value for member in cls],
    )


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    type_annotation_map: ClassVar[dict[Any, Any]] = {
        datetime: UtcTimestamp,
    }

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        pk = getattr(self, "id", None)
        return f"<{type(self).__name__} id={pk}>"


def utc_now_server_default() -> Any:
    """Server-side UTC default, used only for bookkeeping columns.

    Business timestamps are always supplied by the application clock so that
    tests can control them and so that "when did we know this" never depends on
    database wall time.
    """
    return text("timezone('utc', now())")


def positive_check(column: str, constraint_name: str) -> CheckConstraint:
    return CheckConstraint(f"{column} > 0", name=constraint_name)
