"""TEST FIXTURE - hand-built payload samples.

These are constructed by hand to match the documented shape of Solana RPC
responses. They are used to exercise decoding logic deterministically. They are
NOT captured mainnet data and are never presented as real market observations.
"""

from __future__ import annotations

from typing import Any

from vyraxis.core.base58 import b58encode
from vyraxis.solana import programs

# Deterministic, structurally valid addresses for tests.
MEMECOIN_MINT = b58encode(bytes([7] * 32))
TRADER_WALLET = b58encode(bytes([11] * 32))
POOL_ADDRESS = b58encode(bytes([23] * 32))
OTHER_WALLET = b58encode(bytes([31] * 32))


def signature(seed: int) -> str:
    """A structurally valid 64-byte base58 signature derived from ``seed``."""
    return b58encode(bytes([(seed + i) % 251 + 1 for i in range(64)]))


def logs_notification(
    *,
    sig: str,
    slot: int,
    logs: list[str],
    subscription: int = 1,
    err: Any | None = None,
) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "method": "logsNotification",
        "params": {
            "result": {
                "context": {"slot": slot},
                "value": {"signature": sig, "err": err, "logs": logs},
            },
            "subscription": subscription,
        },
    }


PUMPFUN_CREATE_LOGS = [
    f"Program {programs.PUMP_FUN} invoke [1]",
    "Program log: Instruction: Create",
    f"Program {programs.TOKEN_PROGRAM} invoke [2]",
    "Program log: Instruction: InitializeMint2",
    f"Program {programs.PUMP_FUN} success",
]

PUMPFUN_BUY_LOGS = [
    f"Program {programs.PUMP_FUN} invoke [1]",
    "Program log: Instruction: Buy",
    f"Program {programs.TOKEN_PROGRAM} invoke [2]",
    "Program log: Instruction: Transfer",
    f"Program {programs.PUMP_FUN} success",
]

RAYDIUM_POOL_LOGS = [
    f"Program {programs.RAYDIUM_AMM_V4} invoke [1]",
    "Program log: initialize2: InitializeInstruction2 { nonce: 254 }",
    f"Program {programs.RAYDIUM_AMM_V4} success",
]

SPL_TRANSFER_LOGS = [
    f"Program {programs.TOKEN_PROGRAM} invoke [1]",
    "Program log: Instruction: Transfer",
    f"Program {programs.TOKEN_PROGRAM} success",
]


def buy_transaction(
    *,
    sig: str,
    slot: int,
    block_time: int,
    mint: str = MEMECOIN_MINT,
    buyer: str = TRADER_WALLET,
    token_amount_raw: int = 1_000_000_000,
    sol_spent_lamports: int = 500_000_000,
    fee_lamports: int = 5_000,
) -> dict[str, Any]:
    """A ``getTransaction`` (jsonParsed) result for a buy.

    Balances are internally consistent: the buyer's SOL falls by the spend plus
    the fee, and their token balance rises by the purchased amount.
    """
    return {
        "slot": slot,
        "blockTime": block_time,
        "transaction": {
            "signatures": [sig],
            "message": {
                "accountKeys": [
                    {"pubkey": buyer, "signer": True, "writable": True, "source": "transaction"},
                    {
                        "pubkey": POOL_ADDRESS,
                        "signer": False,
                        "writable": True,
                        "source": "transaction",
                    },
                    {
                        "pubkey": programs.PUMP_FUN,
                        "signer": False,
                        "writable": False,
                        "source": "transaction",
                    },
                ],
                "instructions": [
                    {"programId": programs.PUMP_FUN, "accounts": [], "data": ""},
                ],
            },
        },
        "meta": {
            "err": None,
            "fee": fee_lamports,
            "preBalances": [10_000_000_000, 1_000_000, 1],
            "postBalances": [
                10_000_000_000 - sol_spent_lamports - fee_lamports,
                1_000_000 + sol_spent_lamports,
                1,
            ],
            "preTokenBalances": [
                {
                    "accountIndex": 1,
                    "mint": mint,
                    "owner": POOL_ADDRESS,
                    "uiTokenAmount": {"amount": str(token_amount_raw * 10), "decimals": 6},
                }
            ],
            "postTokenBalances": [
                {
                    "accountIndex": 1,
                    "mint": mint,
                    "owner": POOL_ADDRESS,
                    "uiTokenAmount": {"amount": str(token_amount_raw * 9), "decimals": 6},
                },
                {
                    "accountIndex": 3,
                    "mint": mint,
                    "owner": buyer,
                    "uiTokenAmount": {"amount": str(token_amount_raw), "decimals": 6},
                },
            ],
            "innerInstructions": [],
        },
    }
