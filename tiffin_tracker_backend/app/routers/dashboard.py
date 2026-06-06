from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.models.subscriber import Subscriber
from app.models.delivery import Delivery
from app.models.payment import Payment

router = APIRouter()


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    today = date.today()
    billing_month = today.replace(day=1)

    active_count = (
        await db.execute(
            select(func.count()).select_from(Subscriber).where(
                Subscriber.operator_id == operator.id,
                Subscriber.status == "active",
            )
        )
    ).scalar() or 0

    delivered_today = (
        await db.execute(
            select(func.count()).select_from(Delivery).where(
                Delivery.operator_id == operator.id,
                Delivery.delivery_date == today,
                Delivery.status == "delivered",
            )
        )
    ).scalar() or 0

    unpaid_row = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(Payment.amount_due - Payment.amount_paid), 0),
            )
            .select_from(Payment)
            .where(
                Payment.operator_id == operator.id,
                Payment.billing_month == billing_month,
                Payment.status.in_(["pending", "partial"]),
            )
        )
    ).one()

    return {
        "active_count": active_count,
        "delivered_today": delivered_today,
        "unpaid_this_month": unpaid_row[0] or 0,
        "unpaid_total_amount": float(unpaid_row[1] or 0),
    }
