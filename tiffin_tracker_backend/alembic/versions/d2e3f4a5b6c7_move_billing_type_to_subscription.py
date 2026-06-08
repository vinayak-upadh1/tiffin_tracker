"""move_billing_type_to_subscription

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-08 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # remove billing_type from plans
    op.drop_column("plans", "billing_type")

    # add billing_type to subscriptions
    op.add_column(
        "subscriptions",
        sa.Column(
            "billing_type",
            sa.Enum("prepaid", "postpaid"),
            nullable=False,
            server_default="prepaid",
        ),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "billing_type")
    op.add_column(
        "plans",
        sa.Column(
            "billing_type",
            sa.Enum("prepaid", "postpaid"),
            nullable=False,
            server_default="prepaid",
        ),
    )
