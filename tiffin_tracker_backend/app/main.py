import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.limiter import limiter
from app.routers import auth, dashboard, deliveries, payments, plans, subscribers, subscriptions

logger = logging.getLogger(__name__)


async def _cleanup_expired_sessions() -> None:
    """Background task: purge revoked and expired sessions once per day."""
    from sqlalchemy import delete, or_

    from app.database import async_session_maker
    from app.models.session import OperatorSession

    while True:
        await asyncio.sleep(24 * 60 * 60)
        try:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            async with async_session_maker() as db:
                result = await db.execute(
                    delete(OperatorSession).where(
                        or_(
                            OperatorSession.expires_at < now,
                            OperatorSession.is_revoked == True,  # noqa: E712
                        )
                    )
                )
                await db.commit()
                logger.info("Session cleanup: removed %d rows", result.rowcount)
        except Exception:
            logger.exception("Session cleanup failed — will retry in 24 h")


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_cleanup_expired_sessions())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(subscribers.router, prefix="/subscribers", tags=["subscribers"])
app.include_router(plans.router, prefix="/plans", tags=["plans"])
app.include_router(subscriptions.router, prefix="/subscriptions", tags=["subscriptions"])
app.include_router(deliveries.router, prefix="/deliveries", tags=["deliveries"])
app.include_router(payments.router, prefix="/payments", tags=["payments"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
