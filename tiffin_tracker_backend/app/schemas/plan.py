from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, Literal
from decimal import Decimal

MealType = Literal["lunch", "dinner", "both"]


class PlanCreate(BaseModel):
    name: str
    meal_type: MealType
    price_per_month: Decimal
    deliveries_per_month: int

    @field_validator("deliveries_per_month")
    @classmethod
    def validate_deliveries(cls, v: int) -> int:
        if not 1 <= v <= 31:
            raise ValueError("Deliveries per month must be between 1 and 31")
        return v

    @field_validator("price_per_month")
    @classmethod
    def validate_price(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Price must be greater than 0")
        return v


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    meal_type: Optional[MealType] = None
    price_per_month: Optional[Decimal] = None
    deliveries_per_month: Optional[int] = None
    is_active: Optional[bool] = None


class PlanResponse(BaseModel):
    id: int
    operator_id: int
    name: str
    meal_type: str
    price_per_month: Decimal
    deliveries_per_month: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
