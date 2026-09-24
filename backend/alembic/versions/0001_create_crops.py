"""create crops table

Revision ID: 0001_create_crops
Revises:
Create Date: 2026-09-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_create_crops"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crops",
        sa.Column("crop_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("farmer_id", sa.String(length=64), nullable=False),
        sa.Column("crop_name", sa.String(length=120), nullable=False),
        sa.Column("crop_type", sa.String(length=120), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("cultivation_date", sa.Date(), nullable=False),
        sa.Column("expected_harvest_date", sa.Date(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("crop_id"),
    )
    op.create_index("ix_crops_farmer_id", "crops", ["farmer_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crops_farmer_id", table_name="crops")
    op.drop_table("crops")
