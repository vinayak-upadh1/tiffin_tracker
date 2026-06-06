from sqlalchemy import Column, Integer, Date, DateTime, Enum, String, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.models.base import Base


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id"), nullable=False)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)
    delivery_date = Column(Date, nullable=False)
    meal_type = Column(Enum("lunch", "dinner"), nullable=False)
    status = Column(Enum("delivered", "skipped", "paused"), nullable=False, server_default="delivered")
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("subscriber_id", "delivery_date", "meal_type", name="uq_delivery"),
        Index("idx_operator_date", "operator_id", "delivery_date"),
    )
