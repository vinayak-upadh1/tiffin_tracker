import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jose import JWTError, jwt

from app.config import settings


def verify_google_token(credential: str) -> Optional[dict]:
    try:
        return id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception:
        return None


def create_access_token(operator_id: int, email: str) -> str:
    payload = {
        "sub": str(operator_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def generate_refresh_token() -> str:
    """Cryptographically secure random token — 43 URL-safe base64 chars."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 digest of a refresh token. We never persist the raw token."""
    return hashlib.sha256(token.encode()).hexdigest()


def session_expires_at() -> datetime:
    """Absolute expiry for a new or refreshed session (UTC, naive — MySQL DATETIME)."""
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.SESSION_LIFETIME_DAYS)


def utc_aware(dt: datetime) -> datetime:
    """Return a UTC-aware datetime regardless of whether the input is naive or aware.

    MySQL DATETIME columns return naive datetimes; this normalises them so
    comparisons against datetime.now(timezone.utc) work correctly.
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
