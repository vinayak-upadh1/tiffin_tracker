from pydantic import BaseModel
from datetime import date, time
from typing import Optional, Literal, List


DeliveryStatus = Literal["pending", "delivered", "skipped", "paused"]
MealType = Literal["breakfast", "lunch", "snacks", "dinner"]

MEAL_ORDER = {"breakfast": 0, "lunch": 1, "snacks": 2, "dinner": 3}


class DeliveryItem(BaseModel):
    subscriber_id: int
    subscription_id: int
    meal_type: MealType
    status: DeliveryStatus = "pending"
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
    delivery_time: Optional[time] = None
    status: Optional[str] = None
