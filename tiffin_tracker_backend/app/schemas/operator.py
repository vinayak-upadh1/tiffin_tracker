from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class OperatorResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str]
    business_name: Optional[str]
    upi_id: Optional[str]
    profile_picture: Optional[str]
    plan: str
    plan_expires_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class OperatorUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    business_name: Optional[str] = None
    upi_id: Optional[str] = None
