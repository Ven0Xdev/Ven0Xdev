"""Billing provider abstraction — Phase 13, commercial beta readiness.

No real payment gateway (Stripe, Paddle, etc.) is integrated or configured
in this environment. `NullBillingProvider` is the only implementation
shipped: it never collects payment details, never simulates a successful
charge, and honestly reports itself as unconfigured. This mirrors the exact
pattern already used elsewhere in this codebase for an unconfigured
capability — services/data_providers (mock vs real market data) and
services/chat (template vs real LLM backend) both report their real mode
rather than silently faking the configured one.

A real implementation (StripeBillingProvider, etc.) would live alongside
this one and be selected via get_billing_provider() the same way
services/data_providers/factory.py selects a market-data provider — no
call site outside this module should need to change when that happens.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.core.entitlements import PLAN_LIMITS


class BillingProvider(ABC):
    configured: bool

    @abstractmethod
    def status(self) -> dict:
        """Never returns a fabricated "active subscription" or successful
        charge — only real provider-reported state, or an honest
        not-configured report."""


class NullBillingProvider(BillingProvider):
    configured = False

    def status(self) -> dict:
        return {
            "configured": False,
            "message": (
                "Billing is not configured on this deployment. Plans are granted by an operator "
                "during this beta — see /admin, or contact us to request a plan change."
            ),
        }


def get_billing_provider() -> BillingProvider:
    return NullBillingProvider()


def plan_catalog() -> dict:
    return {"plans": PLAN_LIMITS}
