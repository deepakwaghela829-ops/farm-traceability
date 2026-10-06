from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CropPrediction(Base):
    __tablename__ = "crop_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    crop_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    crop_type: Mapped[str] = mapped_column(String(100), nullable=False)
    historical_price: Mapped[float] = mapped_column(Float, nullable=False)
    season: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(150), nullable=False)
    demand: Mapped[float] = mapped_column(Float, nullable=False)
    production_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_price: Mapped[float] = mapped_column(Float, nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, default="Random Forest Regressor")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="kg")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class ConsumerAcknowledgement(Base):
    __tablename__ = "consumer_acknowledgements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    crop_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    acknowledged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
