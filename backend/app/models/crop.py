from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Crop(Base):
    __tablename__ = "crops"

    crop_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_number: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
    farmer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    crop_name: Mapped[str] = mapped_column(String(120), nullable=False)
    crop_type: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    cultivation_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_harvest_date: Mapped[date] = mapped_column(Date, nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)

    # Pricing workflow fields (INR per kg)
    farmer_price_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    supplier_margin_per_kg: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True, default=Decimal("15.00")
    )
    supplier_price_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    retail_price_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    retailer_markup_per_kg: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True, default=Decimal("30.00")
    )
    retail_confirmed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    retail_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Retail receipt & active inventory status
    retailer_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retailer_received_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("1"), nullable=False)

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
