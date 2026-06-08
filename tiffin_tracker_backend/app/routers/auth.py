from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.dependencies import get_current_operator, get_db
from app.limiter import limiter
from app.models.operator import Operator
from app.models.session import OperatorSession
from app.schemas.auth import (
    GoogleAuthRequest,
    RefreshResponse,
    SessionResponse,
    TokenResponse,
)
from app.schemas.operator import OperatorResponse, OperatorUpdate
from app.services.auth import (
    create_access_token,
    generate_refresh_token,
    hash_token,
    session_expires_at,
    utc_aware,
    verify_google_token,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.SESSION_LIFETIME_DAYS * 24 * 60 * 60,
        domain=settings.COOKIE_DOMAIN or None,
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        path="/auth",
        domain=settings.COOKIE_DOMAIN or None,
    )


def _parse_device_label(user_agent: str) -> str:
    ua = user_agent.lower()
    if "iphone" in ua:
        return ("Safari" if "safari" in ua else "Browser") + " on iPhone"
    if "ipad" in ua:
        return "Safari on iPad"
    if "android" in ua:
        return ("Chrome" if "chrome" in ua else "Browser") + " on Android"
    if "macintosh" in ua or "mac os" in ua:
        if "chrome" in ua:
            return "Chrome on macOS"
        if "firefox" in ua:
            return "Firefox on macOS"
        if "safari" in ua:
            return "Safari on macOS"
        return "Browser on macOS"
    if "windows" in ua:
        if "edge" in ua:
            return "Edge on Windows"
        if "chrome" in ua:
            return "Chrome on Windows"
        if "firefox" in ua:
            return "Firefox on Windows"
        return "Browser on Windows"
    if "linux" in ua:
        return ("Chrome" if "chrome" in ua else "Firefox" if "firefox" in ua else "Browser") + " on Linux"
    return "Unknown device"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/google", response_model=TokenResponse)
@limiter.limit("10/minute")
async def google_auth(
    request: Request,
    response: Response,
    payload: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    idinfo = verify_google_token(payload.credential)
    if not idinfo:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_id = idinfo["sub"]
    email = idinfo.get("email", "")
    name = idinfo.get("name", "")
    picture = idinfo.get("picture", "")

    result = await db.execute(select(Operator).where(Operator.google_id == google_id))
    operator = result.scalar_one_or_none()

    if not operator:
        operator = Operator(
            google_id=google_id,
            email=email,
            name=name,
            profile_picture=picture,
        )
        db.add(operator)
        await db.flush()  # populate operator.id before creating the session FK

    if not operator.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    raw_token = generate_refresh_token()
    session = OperatorSession(
        operator_id=operator.id,
        token_hash=hash_token(raw_token),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        device_label=_parse_device_label(request.headers.get("user-agent", "")),
        expires_at=session_expires_at(),
        last_used_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(session)
    await db.commit()

    _set_refresh_cookie(response, raw_token)
    return TokenResponse(access_token=create_access_token(operator.id, operator.email))


# ---------------------------------------------------------------------------
# Silent refresh — called automatically by the frontend when access token expires
# ---------------------------------------------------------------------------

@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("60/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(OperatorSession).where(OperatorSession.token_hash == token_hash)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=401, detail="Session not found")

    # Reuse detection: a revoked token being replayed means the original was stolen.
    # Nuke all sessions for this operator immediately.
    if session.is_revoked:
        await db.execute(
            update(OperatorSession)
            .where(OperatorSession.operator_id == session.operator_id)
            .values(is_revoked=True)
        )
        await db.commit()
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Token reuse detected — all sessions revoked for security",
        )

    now = datetime.now(timezone.utc)
    if utc_aware(session.expires_at) < now:
        raise HTTPException(status_code=401, detail="Session expired — please log in again")

    op_result = await db.execute(select(Operator).where(Operator.id == session.operator_id))
    operator = op_result.scalar_one_or_none()
    if not operator or not operator.is_active:
        raise HTTPException(status_code=401, detail="Operator not found or inactive")

    if settings.REFRESH_TOKEN_ROTATION_ENABLED:
        # Revoke old session; issue a fresh token + session row
        session.is_revoked = True

        new_raw_token = generate_refresh_token()
        new_session = OperatorSession(
            operator_id=operator.id,
            token_hash=hash_token(new_raw_token),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            device_label=session.device_label,   # preserve device label across rotations
            expires_at=session_expires_at(),
            last_used_at=now.replace(tzinfo=None),
        )
        db.add(new_session)
        await db.commit()
        _set_refresh_cookie(response, new_raw_token)
    else:
        # Sliding window only — extend expiry without rotating the token
        session.expires_at = session_expires_at()
        session.last_used_at = now.replace(tzinfo=None)
        await db.commit()

    return RefreshResponse(access_token=create_access_token(operator.id, operator.email))


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Revoke the current device session. Works even if the access token is expired."""
    raw_token = request.cookies.get("refresh_token")
    if raw_token:
        await db.execute(
            update(OperatorSession)
            .where(OperatorSession.token_hash == hash_token(raw_token))
            .values(is_revoked=True)
        )
        await db.commit()
    _clear_refresh_cookie(response)


@router.post("/logout/all", status_code=204)
async def logout_all(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    """Revoke every active session for this operator (log out all devices)."""
    await db.execute(
        update(OperatorSession)
        .where(
            and_(
                OperatorSession.operator_id == operator.id,
                OperatorSession.is_revoked == False,  # noqa: E712
            )
        )
        .values(is_revoked=True)
    )
    await db.commit()
    _clear_refresh_cookie(response)


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
):
    """List all active (non-revoked, non-expired) sessions for the current operator."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = await db.execute(
        select(OperatorSession)
        .where(
            and_(
                OperatorSession.operator_id == operator.id,
                OperatorSession.is_revoked == False,  # noqa: E712
                OperatorSession.expires_at > now,
            )
        )
        .order_by(OperatorSession.last_used_at.desc())
    )
    return result.scalars().all()


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(
    session_id: int,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific session by ID (remote logout for a single device)."""
    result = await db.execute(
        select(OperatorSession).where(
            and_(
                OperatorSession.id == session_id,
                OperatorSession.operator_id == operator.id,
            )
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_revoked = True
    await db.commit()


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/me", response_model=OperatorResponse)
async def get_me(operator: Operator = Depends(get_current_operator)):
    return operator


@router.patch("/me", response_model=OperatorResponse)
async def update_profile(
    data: OperatorUpdate,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(operator, field, value)
    await db.commit()
    await db.refresh(operator)
    return operator
