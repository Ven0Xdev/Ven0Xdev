from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.deps import db_session, get_current_user
from app.core.config import get_settings
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    # 72 = bcrypt's hard byte limit; rejected at the boundary rather than
    # silently truncated inside the hasher.
    password: str = Field(min_length=10, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def _issue(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role, user.token_version),
        refresh_token=create_refresh_token(user.id, user.role, user.token_version),
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _enforce_rate_limit(*keys: str) -> None:
    """Every key must clear its own bucket — a request is throttled the
    moment ANY of them (IP-wide or account-specific) is exhausted. Off by
    default locally; production runs with RATE_LIMIT_ENABLED=true (same
    flag api/deps.py's expensive_rate_limit uses, so one switch covers
    both classes of endpoint)."""
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return

    from app.core.ratelimit import check_rate_limit

    for key in keys:
        allowed, retry_after = check_rate_limit(key, settings.auth_rate_limit_per_minute)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts — please wait before trying again.",
                headers={"Retry-After": str(retry_after)},
            )


async def _submitted_email(request: Request) -> str | None:
    """Reads the raw JSON body directly (via Starlette's cached
    Request.json(), not a second Pydantic-model parameter) so this
    dependency doesn't collide with the endpoint's own body parameter —
    FastAPI embeds each distinctly-named Pydantic-model parameter as its
    own JSON key, so a second `LoginRequest`-typed parameter here would
    silently change the wire contract to `{"request": ..., "body": ...}`.
    Malformed/missing bodies just skip the email-specific bucket; the
    endpoint's own validation still rejects them with its normal 422."""
    try:
        payload = await request.json()
        email = payload.get("email")
        return email.lower() if isinstance(email, str) else None
    except Exception:  # noqa: BLE001 — not this dependency's job to validate the body
        return None


async def login_rate_limit(request: Request) -> None:
    # Two independent buckets: one per source IP (stops a single attacker
    # hammering many accounts), one per targeted email (stops a
    # distributed/many-IP attack against one account) — deliberately never
    # reveals via a different error which bucket tripped, so this cannot be
    # used to enumerate whether an email has an account.
    keys = [f"auth-login-ip:{_client_ip(request)}"]
    email = await _submitted_email(request)
    if email:
        keys.append(f"auth-login-email:{email}")
    _enforce_rate_limit(*keys)


async def register_rate_limit(request: Request) -> None:
    keys = [f"auth-register-ip:{_client_ip(request)}"]
    email = await _submitted_email(request)
    if email:
        keys.append(f"auth-register-email:{email}")
    _enforce_rate_limit(*keys)


def refresh_rate_limit(request: Request) -> None:
    # No email available pre-validation here (the payload is an opaque
    # token, not a credential pair) — IP-only is still a meaningful
    # throttle against refresh-token guessing.
    _enforce_rate_limit(f"auth-refresh-ip:{_client_ip(request)}")


@router.post("/register", response_model=TokenResponse, status_code=201, dependencies=[Depends(register_rate_limit)])
def register(request: RegisterRequest, db: Session = Depends(db_session)):
    """The first registered account becomes the operator (bootstrap);
    everyone after is a regular user. Registration can be disabled entirely
    via ALLOW_REGISTRATION=false once the team is onboarded."""
    settings = get_settings()
    if not settings.allow_registration:
        raise HTTPException(status_code=403, detail="Registration is disabled on this deployment")

    email = request.email.lower()
    if db.query(User).filter_by(email=email).one_or_none() is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    from app.api.deps import DEV_EMAIL

    real_users = db.query(User).filter(User.email != DEV_EMAIL).count()
    user = User(
        email=email,
        password_hash=hash_password(request.password),
        role="operator" if real_users == 0 else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue(user)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_rate_limit)])
def login(request: LoginRequest, db: Session = Depends(db_session)):
    user = db.query(User).filter_by(email=request.email.lower()).one_or_none()
    # Constant-shape response: same error for unknown email and bad
    # password — no account enumeration.
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")
    return _issue(user)


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(refresh_rate_limit)])
def refresh(request: RefreshRequest, db: Session = Depends(db_session)):
    try:
        payload = decode_token(request.refresh_token, REFRESH_TOKEN_TYPE)
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = db.query(User).filter_by(id=int(payload["sub"])).one_or_none()
    if user is None or not user.is_active or payload.get("ver") != user.token_version:
        raise HTTPException(status_code=401, detail="Refresh token revoked — sign in again")
    return _issue(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role, "created_at": user.created_at}
