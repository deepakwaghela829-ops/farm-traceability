import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Any
import jwt

from app.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    """Secure SHA-256 salted password hash."""
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}${hashed}"


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Verifies a plain password against stored salt$hash."""
    if "$" not in stored_hash:
        return False
    salt, hashed = stored_hash.split("$", 1)
    test_hash = hashlib.sha256((salt + plain_password).encode("utf-8")).hexdigest()
    return test_hash == hashed


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except jwt.PyJWTError as err:
        raise ValueError(f"Invalid token: {err}") from err
