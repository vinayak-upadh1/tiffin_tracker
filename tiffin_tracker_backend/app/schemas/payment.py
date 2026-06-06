from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, Literal
from decimal import Decimal


class PaymentDetail(BaseModel):
    id: int
    operator_id: int
    subscriber_id: int
    subscription_id: Optional[int]
    billing_month: date
    amount_due: Decimal
    amount_paid: Decimal
    payment_method: Optional[str]
    status: str
    paid_at: Optional[datetime]
    notes: Optional[str]
    subscriber_name: str
    subscriber_phone: str


class MarkPaidRequest(BaseModel):
    amount_paid: Decimal
    payment_method: Literal["gpay", "cash", "upi", "razorpay", "other"]
    notes: Optional[str] = None
