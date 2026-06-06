from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, Literal

StatusType = Literal["active", "paused", "cancelled"]


class SubscriberCreate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    notes: Optional[str] = None
    status: StatusType = "active"

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = "".join(filter(str.isdigit, v))
        if len(digits) < 10:
            raise ValueError("Phone number must have at least 10 digits")
        return v


class SubscriberUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[StatusType] = None


class SubscriberResponse(BaseModel):
    id: int
    operator_id: int
    name: str
    phone: str
    address: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
