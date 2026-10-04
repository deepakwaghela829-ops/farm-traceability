"""create transactions table

Revision ID: c4d98a12e3f5
Revises: 36b55bb34d31
Create Date: 2026-10-03 17:48:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c4d98a12e3f5"
down_revision = "36b55bb34d31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("crop_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("from_address", sa.String(length=42), nullable=False),
        sa.Column("to_address", sa.String(length=42), nullable=False),
        sa.Column("to_role", sa.String(length=50), nullable=False),
        sa.Column("transaction_hash", sa.String(length=66), nullable=False),
        sa.Column("block_number", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_crop_id", "transactions", ["crop_id"], unique=False)
    op.create_index("ix_transactions_transaction_hash", "transactions", ["transaction_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_transactions_transaction_hash", table_name="transactions")
    op.drop_index("ix_transactions_crop_id", table_name="transactions")
    op.drop_table("transactions")
