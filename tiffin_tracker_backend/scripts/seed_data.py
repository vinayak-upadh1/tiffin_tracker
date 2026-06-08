#!/usr/bin/env python3
"""
Seed script — populate realistic dummy data for development testing.

Run from tiffin_tracker_backend/:
    python scripts/seed_data.py

Idempotent: skips if operator already has >= 5 subscribers.
"""
import asyncio
import os
import random
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.database import async_session_maker
from app.models.delivery import Delivery
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscriber import Subscriber
from app.models.subscription import Subscription

OPERATOR_ID = 1
TODAY = date(2026, 6, 8)
SEED_START = date(2026, 5, 1)  # deliveries/subscriptions start from May 1

random.seed(42)

# ── Subscribers ───────────────────────────────────────────────────────────────

SUBSCRIBERS_DATA = [
    {"name": "Aarav Mehta",     "phone": "9823456710", "address": "B-204, Vasant Kunj, New Delhi",         "notes": "No onion garlic",        "status": "active"},
    {"name": "Kavya Nair",      "phone": "8765432109", "address": "3rd Floor, Banjara Hills, Hyderabad",   "notes": "Jain diet",              "status": "active"},
    {"name": "Rohan Gupta",     "phone": "9512345678", "address": "Flat 12, Shivaji Nagar, Pune",          "notes": None,                     "status": "active"},
    {"name": "Deepa Krishnan",  "phone": "7890123456", "address": "Sector 22, Dwarka, New Delhi",          "notes": "Extra roti please",      "status": "active"},
    {"name": "Arjun Patel",     "phone": "9654321087", "address": "602, Green Park, Ahmedabad",            "notes": None,                     "status": "active"},
    {"name": "Sneha Joshi",     "phone": "8123456790", "address": "MG Road, Indore",                       "notes": "Less spicy",             "status": "active"},
    {"name": "Vikram Singh",    "phone": "9345678901", "address": "Hebbal, Bangalore",                     "notes": None,                     "status": "paused"},
    {"name": "Ananya Rao",      "phone": "7654321890", "address": "Salt Lake, Kolkata",                    "notes": "Diabetic diet",          "status": "active"},
    {"name": "Manish Tiwari",   "phone": "9901234567", "address": "Vastrapur, Ahmedabad",                  "notes": None,                     "status": "active"},
    {"name": "Pooja Verma",     "phone": "8567890123", "address": "Koregaon Park, Pune",                   "notes": "No peanuts",             "status": "active"},
    {"name": "Suresh Iyer",     "phone": "9712345678", "address": "Anna Nagar, Chennai",                   "notes": None,                     "status": "cancelled"},
    {"name": "Lakshmi Reddy",   "phone": "8890123456", "address": "Jubilee Hills, Hyderabad",              "notes": "South Indian preferred", "status": "active"},
]

# ── Plans ─────────────────────────────────────────────────────────────────────

PLANS_DATA = [
    {
        "name": "Morning Breakfast",
        "meal_type": "breakfast",
        "price_per_month": Decimal("1200.00"),
        "price_per_meal": None,
        "deliveries_per_month": 26,
    },
    {
        "name": "Lunch Thali",
        "meal_type": "lunch",
        "price_per_month": Decimal("2500.00"),
        "price_per_meal": None,
        "deliveries_per_month": 26,
    },
    {
        "name": "Dinner Thali Premium",
        "meal_type": "dinner",
        "price_per_month": Decimal("3500.00"),
        "price_per_meal": None,
        "deliveries_per_month": 30,
    },
    {
        "name": "Evening Snacks",
        "meal_type": "snacks",
        "price_per_month": Decimal("800.00"),
        "price_per_meal": None,
        "deliveries_per_month": 26,
    },
    {
        "name": "Lunch (Pay per meal)",
        "meal_type": "lunch",
        "price_per_month": None,
        "price_per_meal": Decimal("100.00"),
        "deliveries_per_month": 26,
    },
]

# ── Subscription templates ────────────────────────────────────────────────────
# (subscriber_index, plan_index, billing_type, delivery_hour, is_paused)
# plan indexes are into PLANS_DATA after insertion (0-indexed relative to new plans)

SUBSCRIPTION_TEMPLATES = [
    # (subscriber_name_key, plan_name_key, billing_type, delivery_hour, paused)
    ("Aarav Mehta",    "Lunch Thali",            "prepaid",  13, False),
    ("Aarav Mehta",    "Morning Breakfast",       "prepaid",  8,  False),
    ("Kavya Nair",     "Dinner Thali Premium",    "postpaid", 20, False),
    ("Rohan Gupta",    "Lunch Thali",             "prepaid",  13, False),
    ("Deepa Krishnan", "Morning Breakfast",       "prepaid",  8,  False),
    ("Deepa Krishnan", "Dinner Thali Premium",    "postpaid", 20, False),
    ("Arjun Patel",    "Lunch (Pay per meal)",    "postpaid", 13, False),
    ("Sneha Joshi",    "Lunch Thali",             "prepaid",  13, False),
    ("Sneha Joshi",    "Evening Snacks",          "prepaid",  17, False),
    ("Vikram Singh",   "Dinner Thali Premium",    "prepaid",  20, True),   # paused
    ("Ananya Rao",     "Morning Breakfast",       "prepaid",  8,  False),
    ("Ananya Rao",     "Lunch Thali",             "postpaid", 13, False),
    ("Manish Tiwari",  "Dinner Thali Premium",    "postpaid", 20, False),
    ("Pooja Verma",    "Lunch Thali",             "prepaid",  13, False),
    ("Suresh Iyer",    "Dinner Thali Premium",    "prepaid",  20, False),  # cancelled
    ("Lakshmi Reddy",  "Morning Breakfast",       "prepaid",  8,  False),
    ("Lakshmi Reddy",  "Lunch Thali",             "postpaid", 13, False),
]


def _amount_due(plan: Plan, billing_month: date) -> Decimal:
    """Calculate amount due for a billing month."""
    if plan.price_per_month:
        return plan.price_per_month
    # per-meal: count weekdays (approx delivery days) in the month
    days_in_month = (
        billing_month.replace(month=billing_month.month % 12 + 1, day=1)
        - timedelta(days=1)
    ).day
    weekdays = sum(
        1
        for d in range(1, days_in_month + 1)
        if date(billing_month.year, billing_month.month, d).weekday() < 6
    )
    deliveries = min(weekdays, plan.deliveries_per_month)
    return (plan.price_per_meal or Decimal("0")) * deliveries


async def seed(session):
    # ── Guard: skip if already seeded ─────────────────────────────────────────
    result = await session.execute(
        select(Subscriber).where(Subscriber.operator_id == OPERATOR_ID)
    )
    existing_subs = result.scalars().all()
    if len(existing_subs) >= 5:
        print(f"Already seeded ({len(existing_subs)} subscribers found). Exiting.")
        return

    print("Seeding dummy data…")

    # ── Insert plans ──────────────────────────────────────────────────────────
    plans_by_name: dict[str, Plan] = {}
    for pd in PLANS_DATA:
        plan = Plan(operator_id=OPERATOR_ID, **pd)
        session.add(plan)
    await session.flush()

    result = await session.execute(
        select(Plan).where(Plan.operator_id == OPERATOR_ID)
    )
    all_plans = result.scalars().all()
    for p in all_plans:
        plans_by_name[p.name] = p

    print(f"  Plans: {len(all_plans)} total")

    # ── Insert subscribers ────────────────────────────────────────────────────
    subs_by_name: dict[str, Subscriber] = {}
    for sd in SUBSCRIBERS_DATA:
        sub = Subscriber(operator_id=OPERATOR_ID, **sd)
        session.add(sub)
    await session.flush()

    result = await session.execute(
        select(Subscriber).where(Subscriber.operator_id == OPERATOR_ID)
    )
    all_subscribers = result.scalars().all()
    for s in all_subscribers:
        subs_by_name[s.name] = s

    print(f"  Subscribers: {len(all_subscribers)} total")

    # ── Insert subscriptions ──────────────────────────────────────────────────
    subscriptions: list[Subscription] = []

    for sub_name, plan_name, billing_type, delivery_hour, is_paused in SUBSCRIPTION_TEMPLATES:
        subscriber = subs_by_name.get(sub_name)
        plan = plans_by_name.get(plan_name)
        if not subscriber or not plan:
            print(f"  WARN: skipping subscription for {sub_name!r} / {plan_name!r}")
            continue

        status = "active"
        pause_start = pause_end = None
        end_date = None

        if is_paused:
            status = "paused"
            pause_start = date(2026, 6, 5)
            pause_end = date(2026, 6, 15)
        elif subscriber.status == "cancelled":
            status = "cancelled"
            end_date = date(2026, 5, 31)

        subscription = Subscription(
            operator_id=OPERATOR_ID,
            subscriber_id=subscriber.id,
            plan_id=plan.id,
            start_date=SEED_START,
            end_date=end_date,
            status=status,
            pause_start=pause_start,
            pause_end=pause_end,
            billing_type=billing_type,
            delivery_time=time(delivery_hour, 0),
        )
        session.add(subscription)
        subscriptions.append((subscription, subscriber, plan))

    await session.flush()
    print(f"  Subscriptions: {len(subscriptions)} added")

    # ── Insert deliveries ─────────────────────────────────────────────────────
    delivery_rows = []
    days_range = (TODAY - SEED_START).days + 1

    for subscription, subscriber, plan in subscriptions:
        sub_status = subscription.status

        for day_offset in range(days_range):
            delivery_date = SEED_START + timedelta(days=day_offset)

            # Sundays off (weekday 6)
            if delivery_date.weekday() == 6:
                continue

            if delivery_date > TODAY:
                continue

            # Determine delivery status
            if sub_status == "cancelled" and subscription.end_date and delivery_date > subscription.end_date:
                continue

            if sub_status == "paused" and subscription.pause_start and subscription.pause_end:
                if subscription.pause_start <= delivery_date <= subscription.pause_end:
                    d_status = "paused"
                else:
                    d_status = "delivered" if delivery_date < TODAY else "pending"
            elif sub_status == "cancelled":
                d_status = "delivered" if delivery_date <= subscription.end_date else "skipped"
            elif delivery_date == TODAY:
                d_status = "pending"
            else:
                # Past: 80% delivered, 10% skipped, 10% leave as delivered
                roll = random.random()
                if roll < 0.82:
                    d_status = "delivered"
                elif roll < 0.92:
                    d_status = "skipped"
                else:
                    d_status = "delivered"

            delivery_rows.append({
                "operator_id": OPERATOR_ID,
                "subscriber_id": subscriber.id,
                "subscription_id": subscription.id,
                "delivery_date": delivery_date,
                "meal_type": plan.meal_type,
                "status": d_status,
                "notes": None,
            })

    # Batch insert with INSERT IGNORE to handle unique constraint on
    # (subscriber_id, delivery_date, meal_type) gracefully
    if delivery_rows:
        stmt = mysql_insert(Delivery).values(delivery_rows).prefix_with("IGNORE")
        await session.execute(stmt)
    print(f"  Deliveries: {len(delivery_rows)} rows attempted")

    # ── Insert payments ───────────────────────────────────────────────────────
    payment_rows = []
    billing_months = [date(2026, 5, 1), date(2026, 6, 1)]

    for subscription, subscriber, plan in subscriptions:
        if subscription.status == "cancelled" and subscription.end_date and subscription.end_date < date(2026, 5, 1):
            continue

        for billing_month in billing_months:
            amount = _amount_due(plan, billing_month)

            # May: mix of paid/partial/pending; June: mostly pending
            if billing_month.month == 5:
                roll = random.random()
                if roll < 0.55:
                    pay_status = "paid"
                    amount_paid = amount
                    paid_at = datetime(2026, 5, random.randint(1, 10), random.randint(9, 20), 0)
                    method = random.choice(["gpay", "cash", "upi", "gpay", "gpay"])
                elif roll < 0.75:
                    pay_status = "partial"
                    amount_paid = (amount * Decimal("0.5")).quantize(Decimal("0.01"))
                    paid_at = datetime(2026, 5, random.randint(1, 15), 10, 0)
                    method = random.choice(["cash", "gpay"])
                else:
                    pay_status = "pending"
                    amount_paid = Decimal("0.00")
                    paid_at = None
                    method = None
            else:
                # June: mostly pending, a few paid early
                roll = random.random()
                if roll < 0.20:
                    pay_status = "paid"
                    amount_paid = amount
                    paid_at = datetime(2026, 6, random.randint(1, 7), random.randint(9, 18), 0)
                    method = random.choice(["gpay", "upi"])
                else:
                    pay_status = "pending"
                    amount_paid = Decimal("0.00")
                    paid_at = None
                    method = None

            payment_rows.append({
                "operator_id": OPERATOR_ID,
                "subscriber_id": subscriber.id,
                "subscription_id": subscription.id,
                "billing_month": billing_month,
                "amount_due": amount,
                "amount_paid": amount_paid,
                "payment_method": method,
                "status": pay_status,
                "paid_at": paid_at,
                "notes": None,
            })

    if payment_rows:
        stmt = mysql_insert(Payment).values(payment_rows).prefix_with("IGNORE")
        await session.execute(stmt)
    print(f"  Payments: {len(payment_rows)} rows attempted")

    await session.commit()
    print("\nDone! Database seeded successfully.")


async def main():
    async with async_session_maker() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
