from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import async_session_maker
from app.services.auth import decode_access_token

security = HTTPBearer()


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        yield session


async def get_current_operator(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    from app.models.operator import Operator

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    operator_id = payload.get("sub")
    result = await db.execute(select(Operator).where(Operator.id == int(operator_id)))
    operator = result.scalar_one_or_none()

    if not operator or not operator.is_active:
        raise HTTPException(status_code=401, detail="Operator not found or inactive")

    return operator
