from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Tiffin Tracker API"
    DEBUG: bool = False

    DATABASE_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    # Short-lived; access tokens expire quickly to limit damage if stolen
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # Refresh token / session settings
    SESSION_LIFETIME_DAYS: int = 30          # sliding window — resets on each use
    REFRESH_TOKEN_ROTATION_ENABLED: bool = True

    # Cookie settings — set COOKIE_SECURE=false in local HTTP dev
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str = ""                  # blank for localhost; ".yourdomain.com" in prod

    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str

    CORS_ORIGINS: List[str] = ["http://localhost:5173"]

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
