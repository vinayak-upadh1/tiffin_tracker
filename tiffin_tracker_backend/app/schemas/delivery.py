from pydantic import BaseModel
from datetime import date
from typing import Optional, Literal, List


DeliveryStatus = Literal["delivered", "skipped", "paused"]
MealType = Literal["lunch", "dinner"]


class DeliveryItem(BaseModel):
    subscriber_id: int
    subscription_id: int
    meal_type: MealType
    status: DeliveryStatus = "delivered"
    notes: Optional[str] = None


class BulkDeliveryRequest(BaseModel):
    date: date
    deliveries: List[DeliveryItem]


class SubscriberDeliveryEntry(BaseModel):
    subscriber_id: int
    subscriber_name: str
    subscriber_phone: str
    subscription_id: int
    plan_id: int
    plan_name: str
    meal_type: str
    status: Optional[str] = None
