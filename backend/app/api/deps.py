from collections.abc import Generator

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ACCESS_TOKEN_TYPE, TokenError, decode_token
from app.db.models.user import User
from app.db.session import get_db
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider

DEV_EMAIL = "dev@local"

_bearer = HTTPBearer(auto_error=False)


def db_session() -> Generator[Session, None, None]:
    yield from get_db()


def data_provider() -> MarketDataProvider:
    return get_data_provider()


def _get_or_create_dev_user(db: Session) -> User:
    """AUTH_REQUIRED=false (local development): a stable local operator
    principal so ownership columns are populated and every code path runs
    exactly as it will in production — the toggle changes *enforcement*,
    never the shape of the code.
    """
    user = db.query(User).filter_by(email=DEV_EMAIL).one_or_none()
    if user is None:
        import secrets

        from app.core.security import hash_password

        user = User(email=DEV_EMAIL, password_hash=hash_password(secrets.token_hex(16)), role="operator")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(db_session),
) -> User:
    settings = get_settings()
    if not settings.auth_required:
        return _get_or_create_dev_user(db)

    # Browsers' EventSource API cannot set custom headers, so the SSE stream
    # endpoint has no way to send Authorization — accept the access token as
    # a query param as a fallback, but only when no header was sent, so
    # every other endpoint's behavior is completely unchanged.
    token = credentials.credentials if credentials else request.query_params.get("token")
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(token, ACCESS_TOKEN_TYPE)
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc

    user = db.query(User).filter_by(id=int(payload["sub"])).one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Account not found or disabled")
    if payload.get("ver") != user.token_version:
        raise HTTPException(status_code=401, detail="Token revoked — sign in again")
    return user


def require_operator(user: User = Depends(get_current_user)) -> User:
    """Gate for actions that change what the platform serves everyone:
    model promotion/training, on-demand scans, outcome evaluation."""
    if user.role != "operator":
        raise HTTPException(status_code=403, detail="Operator role required")
    return user


def expensive_rate_limit(request: Request, user: User = Depends(get_current_user)) -> User:
    """Per-principal token bucket on CPU-heavy endpoints (backtests, scans).
    Off by default locally; production runs with RATE_LIMIT_ENABLED=true.
    """
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return user

    from app.core.ratelimit import check_rate_limit

    key = f"user:{user.id}" if user.email != DEV_EMAIL else f"ip:{request.client.host if request.client else 'unknown'}"
    allowed, retry_after = check_rate_limit(key, settings.rate_limit_expensive_per_minute)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for expensive operations ({settings.rate_limit_expensive_per_minute}/min)",
            headers={"Retry-After": str(retry_after)},
        )
    return user
