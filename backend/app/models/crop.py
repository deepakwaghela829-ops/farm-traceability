from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Crop(Base):
    __tablename__ = "crops"

    crop_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farmer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    crop_name: Mapped[str] = mapped_column(String(120), nullable=False)
    crop_type: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    cultivation_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_harvest_date: Mapped[date] = mapped_column(Date, nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)

    blockchain_crop_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    blockchain_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True, index=True)
    blockchain_contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    blockchain_block_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    blockchain_farmer_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    blockchain_chain_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
