"""Transaction enrichment: turn a signature into token/wallet/amount facts.

``logsSubscribe`` tells us *that* something happened and to which program.
``getTransaction`` tells us *what*. This module performs the second step and is
where a log-derived ``PARTIAL`` event becomes ``DECODED``.

Everything here is derived arithmetic on data the node returned:

* the fee payer is the first signer in ``accountKeys``;
* per-(mint, owner) token deltas come from ``preTokenBalances`` vs
  ``postTokenBalances``, compared as integers in base units;
* the fee payer's SOL delta comes from ``preBalances``/``postBalances`` with the
  transaction fee added back, so the figure is the economic transfer rather
  than transfer-plus-fee.

Nothing is inferred when the data is absent. A transaction whose balances the
node did not return stays ``PARTIAL`` with a reason code saying so.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from vyraxis.core.enums import DecodeStatus, TradeDirection
from vyraxis.core.errors import ProviderError
from vyraxis.core.logging import get_logger
from vyraxis.core.types import is_valid_pubkey
from vyraxis.scanner.events import NormalizedEvent
from vyraxis.solana import programs
from vyraxis.solana.provider import RpcProvider

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class TokenDelta:
    """Net change of one mint for one owner, in integer base units."""

    mint: str
    owner: str | None
    delta_raw: int
    decimals: int | None


@dataclass(frozen=True, slots=True)
class TransactionFacts:
    """What could be extracted from a transaction, and what could not."""

    signature: str | None
    slot: int | None
    block_time: Any | None
    fee_payer: str | None
    fee_lamports: int | None
    sol_delta_lamports: int | None
    mints: tuple[str, ...] = ()
    deltas: tuple[TokenDelta, ...] = ()
    reason_codes: tuple[str, ...] = ()
    program_ids: tuple[str, ...] = ()
    complete: bool = False
    raw_meta: dict[str, Any] = field(default_factory=dict)


def extract_transaction_facts(tx: dict[str, Any]) -> TransactionFacts:
    """Pull structured facts out of a ``jsonParsed`` ``getTransaction`` result."""
    meta = tx.get("meta") or {}
    transaction = tx.get("transaction") or {}
    message = transaction.get("message") or {}
    signatures = transaction.get("signatures") or []
    reasons: list[str] = []

    account_keys = message.get("accountKeys") or []
    fee_payer = _fee_payer(account_keys)
    if fee_payer is None:
        reasons.append("NO_FEE_PAYER")

    fee = meta.get("fee")
    fee_lamports = int(fee) if isinstance(fee, int) else None

    sol_delta = _sol_delta(meta, fee_lamports)
    if sol_delta is None:
        reasons.append("NO_SOL_BALANCES")

    pre = meta.get("preTokenBalances")
    post = meta.get("postTokenBalances")
    if not isinstance(pre, list) or not isinstance(post, list):
        reasons.append("NO_TOKEN_BALANCES")
        deltas: tuple[TokenDelta, ...] = ()
    else:
        deltas = _token_deltas(pre, post)
        if not deltas:
            reasons.append("NO_TOKEN_MOVEMENT")

    mints = tuple(dict.fromkeys(delta.mint for delta in deltas))
    program_ids = tuple(
        dict.fromkeys(
            str(instr["programId"])
            for instr in (message.get("instructions") or [])
            if isinstance(instr, dict) and is_valid_pubkey(instr.get("programId"))
        )
    )

    return TransactionFacts(
        signature=signatures[0] if signatures else None,
        slot=tx.get("slot") if isinstance(tx.get("slot"), int) else None,
        block_time=_block_time(tx.get("blockTime")),
        fee_payer=fee_payer,
        fee_lamports=fee_lamports,
        sol_delta_lamports=sol_delta,
        mints=mints,
        deltas=deltas,
        reason_codes=tuple(reasons),
        program_ids=program_ids,
        complete=not reasons,
        raw_meta={"fee": fee_lamports, "err": meta.get("err")},
    )


def _fee_payer(account_keys: list[Any]) -> str | None:
    for key in account_keys:
        if isinstance(key, dict):
            if key.get("signer") and is_valid_pubkey(key.get("pubkey")):
                return str(key["pubkey"])
        elif is_valid_pubkey(key):
            # Non-jsonParsed encodings return bare strings; index 0 is the payer.
            return str(key)
    return None


def _sol_delta(meta: dict[str, Any], fee_lamports: int | None) -> int | None:
    pre = meta.get("preBalances")
    post = meta.get("postBalances")
    if not isinstance(pre, list) or not isinstance(post, list) or not pre or not post:
        return None
    try:
        delta = int(post[0]) - int(pre[0])
    except (TypeError, ValueError):
        return None
    # Add the fee back: the payer always loses it, and including it would make
    # every sell look slightly larger and every buy slightly smaller.
    return delta + (fee_lamports or 0)


def _token_deltas(pre: list[Any], post: list[Any]) -> tuple[TokenDelta, ...]:
    balances: dict[tuple[str, str | None], int] = defaultdict(int)
    decimals: dict[str, int | None] = {}

    for entry, sign in ((pre, -1), (post, 1)):
        for item in entry:
            if not isinstance(item, dict):
                continue
            mint = item.get("mint")
            if not is_valid_pubkey(mint):
                continue
            owner = item.get("owner") if is_valid_pubkey(item.get("owner")) else None
            ui = item.get("uiTokenAmount") or {}
            amount = ui.get("amount")
            if not isinstance(amount, str | int):
                continue
            try:
                raw = int(amount)
            except ValueError:
                continue
            balances[(str(mint), owner)] += sign * raw
            if isinstance(ui.get("decimals"), int):
                decimals[str(mint)] = ui["decimals"]

    return tuple(
        TokenDelta(mint=mint, owner=owner, delta_raw=delta, decimals=decimals.get(mint))
        for (mint, owner), delta in balances.items()
        if delta != 0
    )


def _block_time(value: Any) -> Any | None:
    if isinstance(value, int):
        from vyraxis.core.clock import from_unix_seconds

        return from_unix_seconds(value)
    return None


def choose_primary_mint(facts: TransactionFacts) -> str | None:
    """Pick the non-quote mint with the largest absolute movement.

    Quote assets (wSOL, USDC) are excluded because they are the *payment* side
    of essentially every memecoin trade; treating one as the subject would make
    every event look like a wSOL event.
    """
    candidates: dict[str, int] = defaultdict(int)
    for delta in facts.deltas:
        if delta.mint in programs.QUOTE_MINTS:
            continue
        candidates[delta.mint] += abs(delta.delta_raw)
    if not candidates:
        return None
    return max(candidates.items(), key=lambda item: item[1])[0]


def enrich_event(event: NormalizedEvent, facts: TransactionFacts) -> NormalizedEvent:
    """Fold transaction facts into an event decoded from logs alone."""
    primary_mint = choose_primary_mint(facts)
    actor = facts.fee_payer

    direction = event.direction
    base_amount: int | None = None
    quote_amount: int | None = None

    if primary_mint is not None:
        actor_delta = sum(
            delta.delta_raw
            for delta in facts.deltas
            if delta.mint == primary_mint and (actor is None or delta.owner == actor)
        )
        if actor_delta == 0:
            # The payer may route through a program-owned account; fall back to
            # the net movement of the mint across all owners.
            actor_delta = sum(
                delta.delta_raw for delta in facts.deltas if delta.mint == primary_mint
            )
        base_amount = abs(actor_delta) or None
        if direction is None and actor_delta != 0:
            direction = TradeDirection.BUY if actor_delta > 0 else TradeDirection.SELL

    quote_deltas = [d for d in facts.deltas if d.mint in programs.QUOTE_MINTS]
    if quote_deltas:
        quote_amount = abs(sum(d.delta_raw for d in quote_deltas)) or None
    elif facts.sol_delta_lamports:
        quote_amount = abs(facts.sol_delta_lamports)

    decode_status = (
        DecodeStatus.DECODED
        if (primary_mint is not None and actor is not None and facts.complete)
        else DecodeStatus.PARTIAL
    )

    return event.with_enrichment(
        token_mint=primary_mint,
        actor_wallet=actor,
        direction=direction,
        base_amount_raw=base_amount,
        quote_amount_raw=quote_amount,
        block_time=facts.block_time,
        decode_status=decode_status,
        extra_reason_codes=("ENRICHED", *facts.reason_codes),
        raw_extra={
            "enrichment": {
                "mints": list(facts.mints),
                "fee_lamports": facts.fee_lamports,
                "sol_delta_lamports": facts.sol_delta_lamports,
                "program_ids": list(facts.program_ids),
            }
        },
    )


class TransactionEnricher:
    """Fetches and folds in transaction detail for events worth resolving.

    Each enrichment is one RPC call, so the caller decides which kinds justify
    the cost (see ``ENRICHABLE_KINDS`` in the pipeline). A failed fetch leaves
    the event ``PARTIAL`` with a reason code - it is never dropped, and never
    filled with placeholder values.
    """

    def __init__(self, rpc: RpcProvider) -> None:
        self._rpc = rpc
        self.attempted = 0
        self.succeeded = 0
        self.failed = 0

    async def enrich(self, event: NormalizedEvent) -> NormalizedEvent:
        if not event.signature:
            return event
        self.attempted += 1
        try:
            tx = await self._rpc.get_transaction(event.signature)
        except ProviderError as exc:
            self.failed += 1
            log.warning(
                "enrichment_failed",
                signature=event.signature,
                error=str(exc),
            )
            return event.with_enrichment(extra_reason_codes=("ENRICHMENT_RPC_FAILED",))

        if tx is None:
            self.failed += 1
            return event.with_enrichment(extra_reason_codes=("ENRICHMENT_TX_NOT_FOUND",))

        facts = extract_transaction_facts(tx)
        self.succeeded += 1
        return enrich_event(event, facts)
