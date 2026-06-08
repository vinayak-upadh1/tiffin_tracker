"""payment_delivery_changes

Revision ID: c1d2e3f4a5b6
Revises: b3e4f5a6b7c8
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # plans: expand meal_type enum (drop 'both', add breakfast/snacks)
    # existing 'both' rows become 'lunch' as a safe default
    op.execute("UPDATE plans SET meal_type = 'lunch' WHERE meal_type = 'both'")
    op.execute(
        "ALTER TABLE plans MODIFY COLUMN meal_type "
        "ENUM('breakfast','lunch','snacks','dinner') NOT NULL"
    )

    # plans: add billing_type and price_per_meal; relax price_per_month to nullable
    op.add_column(
        "plans",
        sa.Column("billing_type", sa.Enum("prepaid", "postpaid"), nullable=False, server_default="prepaid"),
    )
    op.add_column(
        "plans",
        sa.Column("price_per_meal", sa.Numeric(precision=8, scale=2), nullable=True),
    )
    op.alter_column("plans", "price_per_month", existing_type=sa.Numeric(8, 2), nullable=True)

    # subscriptions: add delivery_time
    op.add_column(
        "subscriptions",
        sa.Column("delivery_time", sa.Time(), nullable=True),
    )

    # deliveries: expand meal_type enum
    op.execute(
        "ALTER TABLE deliveries MODIFY COLUMN meal_type "
        "ENUM('breakfast','lunch','snacks','dinner') NOT NULL"
    )

    # deliveries: add 'pending' to status enum and change default
    op.execute(
        "ALTER TABLE deliveries MODIFY COLUMN status "
        "ENUM('pending','delivered','skipped','paused') NOT NULL DEFAULT 'pending'"
    )


def downgrade() -> None:
    op.execute("UPDATE deliveries SET status = 'delivered' WHERE status = 'pending'")
    op.execute(
        "ALTER TABLE deliveries MODIFY COLUMN status "
        "ENUM('delivered','skipped','paused') NOT NULL DEFAULT 'delivered'"
    )
    op.execute(
        "ALTER TABLE deliveries MODIFY COLUMN meal_type "
        "ENUM('lunch','dinner') NOT NULL"
    )
    op.drop_column("subscriptions", "delivery_time")
    op.alter_column("plans", "price_per_month", existing_type=sa.Numeric(8, 2), nullable=False)
    op.drop_column("plans", "price_per_meal")
    op.drop_column("plans", "billing_type")
    op.execute("UPDATE plans SET meal_type = 'lunch' WHERE meal_type IN ('breakfast','snacks')")
    op.execute(
        "ALTER TABLE plans MODIFY COLUMN meal_type "
        "ENUM('lunch','dinner','both') NOT NULL"
    )
