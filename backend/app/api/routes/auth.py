from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.schemas.user import TokenResponse, UserCreate, UserLogin, UserRead
from app.services.auth_service import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & Access Control"])


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token header.",
        )
    token = authorization.split(" ")[1]
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token payload.")
    except Exception as err:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {err}")

    user = db.scalars(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User account not found.")
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    existing_user = db.scalars(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email already registered.")

    user = User(
        username=payload.username.strip(),
        email=payload.email.strip().lower(),
        hashed_password=hash_password(payload.password),
        role=payload.role.upper(),
        wallet_address=payload.wallet_address.strip() if payload.wallet_address else None,
        full_name=payload.full_name.strip() if payload.full_name else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.username, "role": user.role, "id": user.id})
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    username = payload.username.strip()
    user = db.scalars(select(User).where(User.username == username)).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    token = create_access_token({"sub": user.username, "role": user.role, "id": user.id})
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def get_profile(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.get("/users", response_model=list[UserRead])
def list_system_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserRead]:
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required to view system users.")
    users = db.scalars(select(User).order_by(User.id.asc())).all()
    return [UserRead.model_validate(u) for u in users]
