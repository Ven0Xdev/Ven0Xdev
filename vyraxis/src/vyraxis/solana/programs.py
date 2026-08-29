"""Registry of Solana program IDs VYRAXIS watches.

**Provenance warning.** These constants are engineering defaults, not verified
chain reads. Every one is structurally validated (base58, 32 bytes) by
``tests/unit/test_programs.py``, but structural validity does not prove an ID is
the program it is labelled as.

Before running ingestion against mainnet, confirm the set with::

    vyraxis programs verify

which calls ``getAccountInfo`` for each ID and reports whether the account
exists, is executable and is owned by a loader. That check requires RPC access
and therefore cannot be performed at import time.

Any ID may be overridden or replaced entirely via
``VYRAXIS_INGESTION__WATCHED_PROGRAMS``, so a wrong constant here is a
configuration fix, not a code change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from vyraxis.core.types import Pubkey


@dataclass(frozen=True, slots=True)
class ProgramInfo:
    """A program VYRAXIS may subscribe to."""

    program_id: str
    label: str
    category: str
    #: Whether ingestion subscribes to this program by default. Kept small on
    #: purpose: a public RPC endpoint will drop a client that subscribes to
    #: every high-traffic program at once.
    default_watch: bool = False

    def __post_init__(self) -> None:
        Pubkey.from_string(self.program_id)


SYSTEM_PROGRAM: Final[str] = "11111111111111111111111111111111"
TOKEN_PROGRAM: Final[str] = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022_PROGRAM: Final[str] = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
ASSOCIATED_TOKEN_PROGRAM: Final[str] = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
METAPLEX_TOKEN_METADATA: Final[str] = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"

RAYDIUM_AMM_V4: Final[str] = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
RAYDIUM_CPMM: Final[str] = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
RAYDIUM_CLMM: Final[str] = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
PUMP_FUN: Final[str] = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
PUMPSWAP_AMM: Final[str] = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
METEORA_DLMM: Final[str] = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
ORCA_WHIRLPOOL: Final[str] = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"

WRAPPED_SOL_MINT: Final[str] = "So11111111111111111111111111111111111111112"
USDC_MINT: Final[str] = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

REGISTRY: Final[tuple[ProgramInfo, ...]] = (
    ProgramInfo(SYSTEM_PROGRAM, "System Program", "system"),
    ProgramInfo(TOKEN_PROGRAM, "SPL Token", "token", default_watch=True),
    ProgramInfo(TOKEN_2022_PROGRAM, "SPL Token 2022", "token"),
    ProgramInfo(ASSOCIATED_TOKEN_PROGRAM, "Associated Token Account", "token"),
    ProgramInfo(METAPLEX_TOKEN_METADATA, "Metaplex Token Metadata", "metadata"),
    ProgramInfo(RAYDIUM_AMM_V4, "Raydium AMM v4", "dex", default_watch=True),
    ProgramInfo(RAYDIUM_CPMM, "Raydium CPMM", "dex"),
    ProgramInfo(RAYDIUM_CLMM, "Raydium CLMM", "dex"),
    ProgramInfo(PUMP_FUN, "pump.fun bonding curve", "launchpad", default_watch=True),
    ProgramInfo(PUMPSWAP_AMM, "PumpSwap AMM", "dex"),
    ProgramInfo(METEORA_DLMM, "Meteora DLMM", "dex"),
    ProgramInfo(ORCA_WHIRLPOOL, "Orca Whirlpool", "dex"),
)

BY_ID: Final[dict[str, ProgramInfo]] = {info.program_id: info for info in REGISTRY}

#: DEX/launchpad label used when tagging a discovered pool.
DEX_LABELS: Final[dict[str, str]] = {
    RAYDIUM_AMM_V4: "raydium_amm_v4",
    RAYDIUM_CPMM: "raydium_cpmm",
    RAYDIUM_CLMM: "raydium_clmm",
    PUMP_FUN: "pump_fun",
    PUMPSWAP_AMM: "pumpswap",
    METEORA_DLMM: "meteora_dlmm",
    ORCA_WHIRLPOOL: "orca_whirlpool",
}

#: Mints that act as the quote side of a pair. Used to decide which side of a
#: newly discovered pool is the memecoin.
QUOTE_MINTS: Final[frozenset[str]] = frozenset({WRAPPED_SOL_MINT, USDC_MINT})


def default_watched_programs() -> list[str]:
    """Program IDs subscribed to when the operator has not chosen a set."""
    return [info.program_id for info in REGISTRY if info.default_watch]


def label_for(program_id: str) -> str:
    """Human label for a program ID, falling back to the ID itself."""
    info = BY_ID.get(program_id)
    return info.label if info else program_id


def dex_for(program_id: str) -> str | None:
    """DEX slug for a program ID, or None if it is not a known DEX."""
    return DEX_LABELS.get(program_id)
