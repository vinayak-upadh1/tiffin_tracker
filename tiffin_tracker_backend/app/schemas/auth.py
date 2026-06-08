from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    credential: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionResponse(BaseModel):
    id: int
    device_label: Optional[str]
    ip_address: Optional[str]
    last_used_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
