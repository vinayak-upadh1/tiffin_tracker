"""add operator_sessions table

Revision ID: b3e4f5a6b7c8
Revises: 220dc9fb7dc7
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3e4f5a6b7c8"
down_revision: Union[str, None] = "220dc9fb7dc7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operator_sessions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("operator_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("device_label", sa.String(length=200), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column(
            "last_used_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["operator_id"],
            ["operators.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_sessions_token_hash", "operator_sessions", ["token_hash"])
    op.create_index("idx_sessions_operator_id", "operator_sessions", ["operator_id"])
    op.create_index("idx_sessions_expires_at", "operator_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_sessions_expires_at", table_name="operator_sessions")
    op.drop_index("idx_sessions_operator_id", table_name="operator_sessions")
    op.drop_index("idx_sessions_token_hash", table_name="operator_sessions")
    op.drop_table("operator_sessions")
