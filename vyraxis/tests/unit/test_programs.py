"""Program registry structural validation.

Structural validity is all that can be checked offline. Confirming that each ID
*is* the program it claims to be requires the chain, and is done by
``vyraxis programs verify`` against a live RPC endpoint.
"""

from __future__ import annotations

import pytest

from vyraxis.core.types import Pubkey
from vyraxis.solana import programs


@pytest.mark.parametrize("info", programs.REGISTRY, ids=lambda i: i.label)
def test_every_program_id_is_a_valid_pubkey(info: programs.ProgramInfo) -> None:
    assert len(Pubkey.from_string(info.program_id).raw) == 32


def test_program_ids_are_unique() -> None:
    ids = [info.program_id for info in programs.REGISTRY]
    assert len(ids) == len(set(ids))


def test_quote_mints_are_valid_pubkeys() -> None:
    for mint in programs.QUOTE_MINTS:
        assert len(Pubkey.from_string(mint).raw) == 32


def test_default_watch_set_is_small_and_non_empty() -> None:
    watched = programs.default_watched_programs()
    assert watched
    # A public endpoint drops clients that subscribe to everything at once.
    assert len(watched) <= 5


def test_dex_lookup() -> None:
    assert programs.dex_for(programs.RAYDIUM_AMM_V4) == "raydium_amm_v4"
    assert programs.dex_for(programs.TOKEN_PROGRAM) is None


def test_label_falls_back_to_the_id() -> None:
    assert programs.label_for("unknown-id") == "unknown-id"
    assert programs.label_for(programs.PUMP_FUN) == "pump.fun bonding curve"


def test_invalid_program_id_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError):
        programs.ProgramInfo("not-base58!", "bad", "test")
