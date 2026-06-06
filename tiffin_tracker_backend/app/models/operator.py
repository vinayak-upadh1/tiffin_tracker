from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.sql import func
from app.models.base import Base


class Operator(Base):
    __tablename__ = "operators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    google_id = Column(String(100), unique=True, nullable=False)
    phone = Column(String(15), nullable=True)
    profile_picture = Column(String(500), nullable=True)
    business_name = Column(String(150), nullable=True)
    upi_id = Column(String(100), nullable=True)
    plan = Column(Enum("trial", "basic"), nullable=False, server_default="trial")
    plan_expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="1")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
