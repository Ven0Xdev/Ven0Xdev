"""Exact decimal arithmetic for financial and on-chain quantities.

Rules enforced here:

* ``float`` never enters a monetary calculation. Passing a float raises.
* Token amounts are carried as **integer base units** plus a ``decimals``
  scale, exactly as the SPL Token program stores them. Human-scaled values are
  derived, never authoritative.
* Every rounding is explicit. There is no implicit banker's/half-up default
  chosen by whatever code happens to call first.
* Division by zero yields ``None`` (an absent measurement), never ``inf`` or
  ``nan``. A missing ratio must be visible to the caller.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_HALF_EVEN, Context, Decimal, InvalidOperation
from typing import Final

#: Working precision. Memecoin prices routinely sit near 1e-12 while raw u64
#: amounts reach ~1.8e19, so the context must span both without loss.
CALC_CONTEXT: Final[Context] = Context(prec=60)

#: Storage scales, mirrored by the NUMERIC column definitions in storage.models.
RAW_AMOUNT_DIGITS: Final[int] = 40
QTY_SCALE: Final[int] = 18
PRICE_SCALE: Final[int] = 20
USD_SCALE: Final[int] = 10

_QTY_QUANT: Final[Decimal] = Decimal(1).scaleb(-QTY_SCALE)
_PRICE_QUANT: Final[Decimal] = Decimal(1).scaleb(-PRICE_SCALE)
_USD_QUANT: Final[Decimal] = Decimal(1).scaleb(-USD_SCALE)

ZERO: Final[Decimal] = Decimal(0)


def to_decimal(value: Decimal | int | str) -> Decimal:
    """Coerce to ``Decimal``, rejecting ``float`` and non-finite values.

    ``float`` is rejected at the boundary rather than converted: ``0.1`` is not
    one tenth, and a binary-rounded price silently corrupts every downstream
    P&L figure derived from it.
    """
    if isinstance(value, float):
        raise TypeError(
            f"float is not accepted for monetary values; pass Decimal, int or str (got {value!r})"
        )
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, int):
        return Decimal(value)
    elif isinstance(value, str):
        try:
            result = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError(f"not a decimal literal: {value!r}") from exc
    else:
        raise TypeError(f"unsupported type for decimal value: {type(value).__name__}")
    if not result.is_finite():
        raise ValueError(f"non-finite decimal rejected: {result}")
    return result


def raw_to_qty(raw: int, decimals: int) -> Decimal:
    """Convert integer base units to a human-scaled quantity, exactly.

    ``raw_to_qty(1_500_000, 6) == Decimal("1.5")``
    """
    _check_decimals(decimals)
    if not isinstance(raw, int) or isinstance(raw, bool):
        raise TypeError(f"raw amount must be int base units, got {type(raw).__name__}")
    return CALC_CONTEXT.create_decimal(raw).scaleb(-decimals, CALC_CONTEXT)


def qty_to_raw(qty: Decimal | int | str, decimals: int, *, rounding: str = ROUND_DOWN) -> int:
    """Convert a human-scaled quantity to integer base units.

    Defaults to ``ROUND_DOWN`` so a converted order size can never exceed the
    quantity the caller actually intended to move.
    """
    _check_decimals(decimals)
    scaled = to_decimal(qty).scaleb(decimals, CALC_CONTEXT)
    return int(scaled.quantize(Decimal(1), rounding=rounding, context=CALC_CONTEXT))


def quantize_qty(value: Decimal | int | str) -> Decimal:
    """Round a quantity to the persisted quantity scale (half-even)."""
    return to_decimal(value).quantize(_QTY_QUANT, rounding=ROUND_HALF_EVEN, context=CALC_CONTEXT)


def quantize_price(value: Decimal | int | str) -> Decimal:
    """Round a price to the persisted price scale (half-even)."""
    return to_decimal(value).quantize(_PRICE_QUANT, rounding=ROUND_HALF_EVEN, context=CALC_CONTEXT)


def quantize_usd(value: Decimal | int | str) -> Decimal:
    """Round a USD amount to the persisted USD scale (half-even)."""
    return to_decimal(value).quantize(_USD_QUANT, rounding=ROUND_HALF_EVEN, context=CALC_CONTEXT)


def safe_div(numerator: Decimal | int | str, denominator: Decimal | int | str) -> Decimal | None:
    """Divide, returning ``None`` when the denominator is zero.

    A ratio that cannot be computed is an *absent measurement*. Returning None
    forces the caller to handle it instead of propagating a poisoned number.
    """
    den = to_decimal(denominator)
    if den == 0:
        return None
    return CALC_CONTEXT.divide(to_decimal(numerator), den)


def lamports_to_sol(lamports: int) -> Decimal:
    """Convert lamports to SOL (9 decimals)."""
    return raw_to_qty(lamports, LAMPORTS_DECIMALS)


LAMPORTS_DECIMALS: Final[int] = 9
LAMPORTS_PER_SOL: Final[int] = 1_000_000_000


def _check_decimals(decimals: int) -> None:
    if not isinstance(decimals, int) or isinstance(decimals, bool):
        raise TypeError(f"decimals must be int, got {type(decimals).__name__}")
    if not 0 <= decimals <= 32:
        raise ValueError(f"decimals out of plausible SPL range 0..32: {decimals}")
