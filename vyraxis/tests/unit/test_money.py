"""Financial arithmetic must be exact and must reject floats."""

from __future__ import annotations

from decimal import ROUND_UP, Decimal

import pytest

from vyraxis.core.money import (
    LAMPORTS_PER_SOL,
    lamports_to_sol,
    qty_to_raw,
    quantize_price,
    quantize_usd,
    raw_to_qty,
    safe_div,
    to_decimal,
)


def test_float_is_rejected_everywhere() -> None:
    with pytest.raises(TypeError, match="float is not accepted"):
        to_decimal(0.1)
    with pytest.raises(TypeError, match="float is not accepted"):
        qty_to_raw(1.5, 6)
    with pytest.raises(TypeError, match="float is not accepted"):
        quantize_usd(1.23)


def test_raw_to_qty_is_exact() -> None:
    assert raw_to_qty(1_500_000, 6) == Decimal("1.5")
    assert raw_to_qty(1, 9) == Decimal("0.000000001")
    assert raw_to_qty(0, 6) == Decimal("0")


def test_raw_to_qty_handles_u64_max_without_loss() -> None:
    u64_max = 2**64 - 1
    assert raw_to_qty(u64_max, 0) == Decimal(u64_max)
    # A float would lose the low-order digits here; Decimal must not.
    assert raw_to_qty(u64_max, 9) * Decimal(10**9) == Decimal(u64_max)


def test_qty_to_raw_rounds_down_by_default() -> None:
    # Rounding up would produce an order larger than the caller asked for.
    assert qty_to_raw("1.9999999", 6) == 1_999_999
    assert qty_to_raw("1.9999999", 6, rounding=ROUND_UP) == 2_000_000


def test_qty_to_raw_rejects_absurd_decimals() -> None:
    with pytest.raises(ValueError, match="decimals out of plausible"):
        qty_to_raw("1", 40)


def test_raw_amount_must_be_int() -> None:
    with pytest.raises(TypeError, match="raw amount must be int"):
        raw_to_qty(Decimal("1"), 6)  # type: ignore[arg-type]


def test_safe_div_returns_none_not_infinity() -> None:
    assert safe_div(1, 0) is None
    assert safe_div(0, 0) is None
    assert safe_div(3, 2) == Decimal("1.5")


def test_lamports_conversion() -> None:
    assert lamports_to_sol(LAMPORTS_PER_SOL) == Decimal(1)
    assert lamports_to_sol(1) == Decimal("0.000000001")


def test_price_quantization_keeps_sub_nano_precision() -> None:
    tiny = quantize_price("0.00000000012345678901234")
    assert tiny == Decimal("0.00000000012345678901")
    assert tiny > 0


def test_non_finite_decimals_rejected() -> None:
    with pytest.raises(ValueError, match="non-finite"):
        to_decimal(Decimal("NaN"))
    with pytest.raises(ValueError, match="non-finite"):
        to_decimal(Decimal("Infinity"))
