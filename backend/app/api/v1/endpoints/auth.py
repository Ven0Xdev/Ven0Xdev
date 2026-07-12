from fastapi import APIRouter, Depends, HTTPException
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


@router.post("/register", response_model=TokenResponse, status_code=201)
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


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(db_session)):
    user = db.query(User).filter_by(email=request.email.lower()).one_or_none()
    # Constant-shape response: same error for unknown email and bad
    # password — no account enumeration.
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")
    return _issue(user)


@router.post("/refresh", response_model=TokenResponse)
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
