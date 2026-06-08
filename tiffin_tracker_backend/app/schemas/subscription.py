from pydantic import BaseModel
from datetime import date, time
from typing import Optional, Literal


class SubscriptionCreate(BaseModel):
    subscriber_id: int
    plan_id: int
    billing_type: Literal["prepaid", "postpaid"] = "prepaid"
    start_date: Optional[date] = None
    delivery_time: Optional[time] = None


class SubscriptionUpdate(BaseModel):
    plan_id: int


class SubscriptionResponse(BaseModel):
    id: int
    subscriber_id: int
    plan_id: int
    operator_id: int
    start_date: date
    end_date: Optional[date]
    status: str
    pause_start: Optional[date]
    pause_end: Optional[date]
    billing_type: str
    delivery_time: Optional[time]

    model_config = {"from_attributes": True}
