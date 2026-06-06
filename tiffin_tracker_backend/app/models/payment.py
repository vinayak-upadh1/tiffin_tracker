from sqlalchemy import Column, Integer, Date, DateTime, Enum, String, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.models.base import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id"), nullable=False)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)
    billing_month = Column(Date, nullable=False)
    amount_due = Column(Numeric(8, 2), nullable=False)
    amount_paid = Column(Numeric(8, 2), nullable=False, server_default="0")
    payment_method = Column(Enum("gpay", "cash", "upi", "razorpay", "other"), nullable=True)
    status = Column(Enum("pending", "partial", "paid"), nullable=False, server_default="pending")
    paid_at = Column(DateTime, nullable=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("subscriber_id", "billing_month", name="uq_sub_month"),
        Index("idx_operator_month", "operator_id", "billing_month"),
    )
