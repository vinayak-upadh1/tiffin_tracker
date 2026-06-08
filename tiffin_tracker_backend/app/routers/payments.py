from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.dependencies import get_db, get_current_operator
from app.models.operator import Operator
from app.models.subscriber import Subscriber
from app.models.subscription import Subscription
from app.models.plan import Plan
from app.models.payment import Payment
from app.models.delivery import Delivery
from app.models.reminder_log import ReminderLog
from app.schemas.payment import PaymentDetail, MarkPaidRequest

router = APIRouter()


async def _build_detail(
    payment: Payment,
    subscriber: Subscriber,
    billing_type: str,
    db: AsyncSession,
) -> PaymentDetail:
    meal_breakdown: Optional[dict] = None
    amount_due = payment.amount_due

    if billing_type == "postpaid":
        month_start = payment.billing_month
        # last day of billing month
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1)

        deliveries = (
            await db.execute(
                select(Delivery).where(
                    and_(
                        Delivery.subscriber_id == subscriber.id,
                        Delivery.operator_id == payment.operator_id,
                        Delivery.status == "delivered",
                        Delivery.delivery_date >= month_start,
                        Delivery.delivery_date < month_end,
                    )
                )
            )
        ).scalars().all()

        counts: dict = defaultdict(int)
        for d in deliveries:
            counts[d.meal_type] += 1
        meal_breakdown = dict(counts) if counts else {}

        # look up price_per_meal from the subscription's plan
        if payment.subscription_id:
            sub_result = await db.execute(
                select(Subscription).where(Subscription.id == payment.subscription_id)
            )
            subscription = sub_result.scalar_one_or_none()
            if subscription:
                plan_result = await db.execute(
                    select(Plan).where(Plan.id == subscription.plan_id)
                )
                plan = plan_result.scalar_one_or_none()
                if plan and plan.price_per_meal:
                    total_meals = sum(counts.values())
                    amount_due = Decimal(str(plan.price_per_meal)) * total_meals

    return PaymentDetail(
        id=payment.id,
        operator_id=payment.operator_id,
        subscriber_id=payment.subscriber_id,
        subscription_id=payment.subscription_id,
        billing_month=payment.billing_month,
        amount_due=amount_due,
        amount_paid=payment.amount_paid,
        payment_method=payment.payment_method,
        status=payment.status,
        paid_at=payment.paid_at,
        notes=payment.notes,
        subscriber_name=subscriber.name,
        subscriber_phone=subscriber.phone,
        billing_type=billing_type,
        meal_breakdown=meal_breakdown,
    )


async def _get_billing_type(payment: Payment, db: AsyncSession) -> str:
    if not payment.subscription_id:
        return "prepaid"
    sub = (await db.execute(
        select(Subscription).where(Subscription.id == payment.subscription_id)
    )).scalar_one_or_none()
    return sub.billing_type if sub else "prepaid"


@router.get("", response_model=list[PaymentDetail])
async def list_payments(
    month: Optional[str] = Query(None, description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    try:
        billing_month = date.fromisoformat(f"{month}-01") if month else date.today().replace(day=1)
    except ValueError:
        billing_month = date.today().replace(day=1)

    rows = (
        await db.execute(
            select(Payment, Subscriber)
            .join(Subscriber, Payment.subscriber_id == Subscriber.id)
            .where(
                Payment.operator_id == operator.id,
                Payment.billing_month == billing_month,
            )
            .order_by(Subscriber.name)
        )
    ).all()

    results = []
    for payment, subscriber in rows:
        billing_type = await _get_billing_type(payment, db)
        results.append(await _build_detail(payment, subscriber, billing_type, db))
    return results


@router.patch("/{payment_id}", response_model=PaymentDetail)
async def mark_payment(
    payment_id: int,
    data: MarkPaidRequest,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    row = (
        await db.execute(
            select(Payment, Subscriber)
            .join(Subscriber, Payment.subscriber_id == Subscriber.id)
            .where(Payment.id == payment_id, Payment.operator_id == operator.id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")

    payment, subscriber = row
    billing_type = await _get_billing_type(payment, db)

    payment.amount_paid = data.amount_paid
    payment.payment_method = data.payment_method
    payment.notes = data.notes
    payment.status = "paid" if data.amount_paid >= payment.amount_due else "partial"
    payment.paid_at = datetime.utcnow()
    await db.commit()
    await db.refresh(payment)
    return await _build_detail(payment, subscriber, billing_type, db)


@router.post("/{payment_id}/remind", status_code=200)
async def log_reminder(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
    operator: Operator = Depends(get_current_operator),
):
    row = (
        await db.execute(
            select(Payment, Subscriber)
            .join(Subscriber, Payment.subscriber_id == Subscriber.id)
            .where(Payment.id == payment_id, Payment.operator_id == operator.id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")

    payment, subscriber = row
    billing_type = await _get_billing_type(payment, db)
    detail = await _build_detail(payment, subscriber, billing_type, db)

    month_str = payment.billing_month.strftime("%B %Y")
    upi = operator.upi_id or "N/A"
    amount = int(detail.amount_due)

    if billing_type == "postpaid" and detail.meal_breakdown:
        meal_labels = {"breakfast": "breakfast", "lunch": "lunch", "snacks": "snacks", "dinner": "dinner"}
        parts = [f"{v} {meal_labels.get(k, k)}" for k, v in detail.meal_breakdown.items() if v > 0]
        breakdown_str = ", ".join(parts)
        message = (
            f"Hi {subscriber.name}, your tiffin bill for {month_str} is "
            f"₹{amount} ({breakdown_str}). Please send on GPay: {upi}. Thank you! 🙏"
        )
    else:
        message = (
            f"Hi {subscriber.name}, your tiffin bill for {month_str} is "
            f"₹{amount}. Please send on GPay: {upi}. Thank you! 🙏"
        )

    db.add(
        ReminderLog(
            operator_id=operator.id,
            subscriber_id=subscriber.id,
            payment_id=payment_id,
            message=message,
        )
    )
    await db.commit()
    return {"message": message}
