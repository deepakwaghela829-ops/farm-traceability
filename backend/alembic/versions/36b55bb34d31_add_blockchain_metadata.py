from alembic import op
import sqlalchemy as sa


revision = "36b55bb34d31"
down_revision = "0001_create_crops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crops", sa.Column("blockchain_crop_id", sa.Integer(), nullable=True))
    op.add_column("crops", sa.Column("blockchain_tx_hash", sa.String(length=66), nullable=True))
    op.add_column("crops", sa.Column("blockchain_contract_address", sa.String(length=42), nullable=True))
    op.add_column("crops", sa.Column("blockchain_block_number", sa.Integer(), nullable=True))
    op.add_column("crops", sa.Column("blockchain_farmer_address", sa.String(length=42), nullable=True))
    op.add_column("crops", sa.Column("blockchain_chain_id", sa.Integer(), nullable=True))

    op.create_index("ix_crops_blockchain_crop_id", "crops", ["blockchain_crop_id"], unique=False)
    op.create_index("ix_crops_blockchain_tx_hash", "crops", ["blockchain_tx_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crops_blockchain_tx_hash", table_name="crops")
    op.drop_index("ix_crops_blockchain_crop_id", table_name="crops")

    op.drop_column("crops", "blockchain_chain_id")
    op.drop_column("crops", "blockchain_farmer_address")
    op.drop_column("crops", "blockchain_block_number")
    op.drop_column("crops", "blockchain_contract_address")
    op.drop_column("crops", "blockchain_tx_hash")
    op.drop_column("crops", "blockchain_crop_id")
