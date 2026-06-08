from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.models.base import Base


class OperatorSession(Base):
    __tablename__ = "operator_sessions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("operators.id", ondelete="CASCADE"), nullable=False)
    # We store SHA-256(token), never the raw token — same principle as password hashing
    token_hash = Column(String(64), nullable=False)
    device_label = Column(String(200), nullable=True)
    ip_address = Column(String(45), nullable=True)   # supports both IPv4 and IPv6
    user_agent = Column(String(500), nullable=True)
    # Sliding window: updated to now() + SESSION_LIFETIME_DAYS on each successful refresh
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=False, server_default=func.now())
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    is_revoked = Column(Boolean, nullable=False, server_default="0")

    __table_args__ = (
        Index("idx_sessions_token_hash", "token_hash"),
        Index("idx_sessions_operator_id", "operator_id"),
        Index("idx_sessions_expires_at", "expires_at"),
    )
