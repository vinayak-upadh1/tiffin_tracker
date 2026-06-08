from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Numeric, SmallInteger, ForeignKey
from sqlalchemy.sql import func
from app.models.base import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    name = Column(String(100), nullable=False)
    meal_type = Column(Enum("breakfast", "lunch", "snacks", "dinner"), nullable=False)
    price_per_month = Column(Numeric(8, 2), nullable=True)
    price_per_meal = Column(Numeric(8, 2), nullable=True)
    deliveries_per_month = Column(SmallInteger, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="1")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
