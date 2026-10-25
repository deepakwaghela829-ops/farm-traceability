"""add pricing fields to crops table

Revision ID: d5e6f7a8b9c0
Revises: c4d98a12e3f5
Create Date: 2026-10-25 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "d5e6f7a8b9c0"
down_revision = "c4d98a12e3f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crops", sa.Column("farmer_price_per_kg", sa.Numeric(10, 2), nullable=True))
    op.add_column("crops", sa.Column("retail_price_per_kg", sa.Numeric(10, 2), nullable=True))
    op.add_column("crops", sa.Column("retailer_markup_per_kg", sa.Numeric(10, 2), nullable=True, server_default="30.00"))
    op.add_column("crops", sa.Column("retail_confirmed_by", sa.String(length=64), nullable=True))
    op.add_column("crops", sa.Column("retail_confirmed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("crops", "retail_confirmed_at")
    op.drop_column("crops", "retail_confirmed_by")
    op.drop_column("crops", "retailer_markup_per_kg")
    op.drop_column("crops", "retail_price_per_kg")
    op.drop_column("crops", "farmer_price_per_kg")
