from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.models.subscriber import Subscriber
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.payment import Payment
from app.schemas.subscription import SubscriptionCreate, SubscriptionResponse

router = APIRouter()


@router.get("", response_model=list[SubscriptionResponse])
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    result = await db.execute(
        select(Subscription)
        .where(
            Subscription.operator_id == operator.id,
            Subscription.status == "active",
        )
        .order_by(Subscription.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=SubscriptionResponse, status_code=201)
async def create_subscription(
    data: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    sub_result = await db.execute(
        select(Subscriber).where(
            Subscriber.id == data.subscriber_id,
            Subscriber.operator_id == operator.id,
        )
    )
    if not sub_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Subscriber not found")

    plan_result = await db.execute(
        select(Plan).where(
            Plan.id == data.plan_id,
            Plan.operator_id == operator.id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    subscription = Subscription(
        subscriber_id=data.subscriber_id,
        plan_id=data.plan_id,
        operator_id=operator.id,
        start_date=data.start_date or date.today(),
    )
    db.add(subscription)
    await db.flush()

    billing_month = date.today().replace(day=1)
    existing = await db.execute(
        select(Payment).where(
            Payment.subscriber_id == data.subscriber_id,
            Payment.billing_month == billing_month,
            Payment.operator_id == operator.id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(
            Payment(
                operator_id=operator.id,
                subscriber_id=data.subscriber_id,
                subscription_id=subscription.id,
                billing_month=billing_month,
                amount_due=plan.price_per_month,
            )
        )

    await db.commit()
    await db.refresh(subscription)
    return subscription
