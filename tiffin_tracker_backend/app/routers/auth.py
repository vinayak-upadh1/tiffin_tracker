from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.schemas.auth import GoogleAuthRequest, TokenResponse
from app.schemas.operator import OperatorResponse, OperatorUpdate
from app.services.auth import verify_google_token, create_access_token

router = APIRouter()


@router.post("/google", response_model=TokenResponse)
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    idinfo = verify_google_token(request.credential)
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
        await db.commit()

    return TokenResponse(access_token=create_access_token(operator.id, operator.email))


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
