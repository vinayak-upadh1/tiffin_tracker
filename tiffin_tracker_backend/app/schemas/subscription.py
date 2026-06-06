from pydantic import BaseModel
from datetime import date
from typing import Optional


class SubscriptionCreate(BaseModel):
    subscriber_id: int
    plan_id: int
    start_date: Optional[date] = None


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

    model_config = {"from_attributes": True}
