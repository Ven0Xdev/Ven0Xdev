from datetime import datetime

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class User(Base):
    """Platform account. Roles: 'user' (research access) and 'operator'
    (model promotion, on-demand scans, outcome evaluation — the actions
    that change what the platform serves to everyone).

    `token_version` implements cheap global revocation: bumping it
    invalidates every outstanding access/refresh token for the account
    (tokens carry the version they were minted with).

    `plan` (Phase 13, commercial beta readiness) gates per-resource usage
    limits — see app/core/entitlements.py. No self-serve checkout exists
    (no real payment provider is configured in this environment; see
    services/billing/provider.py's NullBillingProvider) — an operator
    grants a plan directly via PATCH /admin/users/{id}/plan, an explicit,
    auditable, no-fake-payment substitute for real billing during the beta.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="user")  # user | operator
    plan: Mapped[str] = mapped_column(String(16), default="free")  # free | pro
    is_active: Mapped[bool] = mapped_column(default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # IANA timezone name (e.g. "Asia/Jerusalem") or one of the synthetic
    # preference values "device"/"exchange"/"utc". NULL means the client
    # hasn't set a server-side preference yet and falls back to its own
    # localStorage value (device detection wins by default).
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
