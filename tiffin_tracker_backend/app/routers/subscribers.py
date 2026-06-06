from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.models.subscriber import Subscriber
from app.schemas.subscriber import SubscriberCreate, SubscriberUpdate, SubscriberResponse

router = APIRouter()

TRIAL_SUBSCRIBER_LIMIT = 5


@router.get("", response_model=list[SubscriberResponse])
async def list_subscribers(
    status: Optional[str] = Query(None, pattern="^(active|paused|cancelled)$"),
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    query = select(Subscriber).where(Subscriber.operator_id == operator.id)
    if status:
        query = query.where(Subscriber.status == status)
    query = query.order_by(Subscriber.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=SubscriberResponse, status_code=201)
async def create_subscriber(
    data: SubscriberCreate,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    if operator.plan == "trial":
        count_result = await db.execute(
            select(func.count()).select_from(Subscriber).where(
                Subscriber.operator_id == operator.id,
                Subscriber.status != "cancelled",
            )
        )
        if (count_result.scalar() or 0) >= TRIAL_SUBSCRIBER_LIMIT:
            raise HTTPException(
                status_code=402,
                detail=f"Trial plan limited to {TRIAL_SUBSCRIBER_LIMIT} active subscribers. Upgrade to add more.",
            )

    subscriber = Subscriber(**data.model_dump(), operator_id=operator.id)
    db.add(subscriber)
    await db.commit()
    await db.refresh(subscriber)
    return subscriber


@router.get("/{subscriber_id}", response_model=SubscriberResponse)
async def get_subscriber(
    subscriber_id: int,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Subscriber).where(
            Subscriber.id == subscriber_id,
            Subscriber.operator_id == operator.id,
        )
    )
    subscriber = result.scalar_one_or_none()
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    return subscriber


@router.put("/{subscriber_id}", response_model=SubscriberResponse)
async def update_subscriber(
    subscriber_id: int,
    data: SubscriberUpdate,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Subscriber).where(
            Subscriber.id == subscriber_id,
            Subscriber.operator_id == operator.id,
        )
    )
    subscriber = result.scalar_one_or_none()
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(subscriber, field, value)

    await db.commit()
    await db.refresh(subscriber)
    return subscriber


@router.delete("/{subscriber_id}", status_code=204)
async def delete_subscriber(
    subscriber_id: int,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Subscriber).where(
            Subscriber.id == subscriber_id,
            Subscriber.operator_id == operator.id,
        )
    )
    subscriber = result.scalar_one_or_none()
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    subscriber.status = "cancelled"
    await db.commit()
