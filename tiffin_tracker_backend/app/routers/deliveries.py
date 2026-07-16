from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.models.subscriber import Subscriber
from app.models.subscription import Subscription
from app.models.plan import Plan
from app.models.delivery import Delivery
from app.schemas.delivery import BulkDeliveryRequest, SubscriberDeliveryEntry, MEAL_ORDER

router = APIRouter()


@router.get("", response_model=list[SubscriberDeliveryEntry])
async def list_deliveries(
    date: Optional[date_type] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    target_date = date or date_type.today()

    rows = (
        await db.execute(
            select(Subscription, Subscriber, Plan)
            .join(Subscriber, Subscription.subscriber_id == Subscriber.id)
            .join(Plan, Subscription.plan_id == Plan.id)
            .where(
                Subscription.operator_id == operator.id,
                Subscription.status == "active",
                Subscriber.status == "active",
            )
        )
    ).all()

    existing = {
        (d.subscriber_id, d.meal_type): d.status
        for d in (
            await db.execute(
                select(Delivery).where(
                    Delivery.operator_id == operator.id,
                    Delivery.delivery_date == target_date,
                )
            )
        ).scalars().all()
    }

    entries = []
    for subscription, subscriber, plan in rows:
        entries.append(
            SubscriberDeliveryEntry(
                subscriber_id=subscriber.id,
                subscriber_name=subscriber.name,
                subscriber_phone=subscriber.phone,
                subscription_id=subscription.id,
                plan_id=plan.id,
                plan_name=plan.name,
                meal_type=plan.meal_type,
                delivery_time=subscription.delivery_time,
                status=existing.get((subscriber.id, plan.meal_type)),
            )
        )

    def sort_key(e: SubscriberDeliveryEntry):
        time_key = (0, e.delivery_time) if e.delivery_time else (1, None)
        meal_key = MEAL_ORDER.get(e.meal_type, 99)
        return (time_key[0], time_key[1] or "", meal_key, e.subscriber_name)

    return sorted(entries, key=sort_key)


@router.post("/bulk", status_code=200)
async def bulk_mark_deliveries(
    data: BulkDeliveryRequest,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    if data.deliveries:
        subscriber_ids = {item.subscriber_id for item in data.deliveries}
        subscription_ids = {item.subscription_id for item in data.deliveries}
        owned = (
            await db.execute(
                select(Subscription.id, Subscription.subscriber_id).where(
                    Subscription.operator_id == operator.id,
                    Subscription.id.in_(subscription_ids),
                    Subscription.subscriber_id.in_(subscriber_ids),
                )
            )
        ).all()
        owned_pairs = {(sub_id, subscriber_id) for sub_id, subscriber_id in owned}

        for item in data.deliveries:
            if (item.subscription_id, item.subscriber_id) not in owned_pairs:
                raise HTTPException(
                    status_code=404,
                    detail=f"Subscription {item.subscription_id} not found",
                )

    for item in data.deliveries:
        stmt = mysql_insert(Delivery).values(
            operator_id=operator.id,
            subscriber_id=item.subscriber_id,
            subscription_id=item.subscription_id,
            delivery_date=data.date,
            meal_type=item.meal_type,
            status=item.status,
            notes=item.notes,
        )
        await db.execute(
            stmt.on_duplicate_key_update(
                status=stmt.inserted.status,
                notes=stmt.inserted.notes,
            )
        )

    await db.commit()
    return {"saved": len(data.deliveries)}
