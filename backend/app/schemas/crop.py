from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CropCreate(BaseModel):
    farmer_id: str = Field(min_length=1, max_length=64)
    crop_name: str = Field(min_length=1, max_length=120)
    crop_type: str = Field(min_length=1, max_length=120)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: str = Field(min_length=1, max_length=20)
    cultivation_date: date
    expected_harvest_date: date
    location: str = Field(min_length=1, max_length=200)

    farmer_price_per_kg: Decimal | None = Field(
        default=None,
        max_digits=10,
        decimal_places=2,
        description="Confirmed farm-gate price per kg in INR",
    )

    blockchain_crop_id: int | None = Field(default=None, gt=0)
    blockchain_tx_hash: str | None = Field(default=None, max_length=66)
    blockchain_contract_address: str | None = Field(default=None, max_length=42)
    blockchain_block_number: int | None = Field(default=None, ge=0)
    blockchain_farmer_address: str | None = Field(default=None, max_length=42)
    blockchain_chain_id: int | None = Field(default=None, ge=1)

    @field_validator("farmer_price_per_kg")
    @classmethod
    def validate_farmer_price(cls, value: Decimal | None) -> Decimal | None:
        if value is not None:
            if value <= Decimal("0"):
                raise ValueError("Farmer price must be a positive number")
            if value < Decimal("1.00"):
                raise ValueError("Farmer price must be at least ₹1.00/kg (e.g. ₹0.50/kg is not a valid price)")
        return value

    @field_validator(
        "farmer_id",
        "crop_name",
        "crop_type",
        "unit",
        "location",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("must be text")
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.expected_harvest_date < self.cultivation_date:
            raise ValueError("expected_harvest_date cannot be before cultivation_date")
        return self


class CropRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    crop_id: int
    farmer_id: str
    crop_name: str
    crop_type: str
    quantity: Decimal
    unit: str
    cultivation_date: date
    expected_harvest_date: date
    location: str

    # Pricing workflow fields (INR per kg)
    farmer_price_per_kg: Decimal | None = Field(default=None, description="Confirmed farm-gate price in INR/kg")
    retail_price_per_kg: Decimal | None = Field(default=None, description="Confirmed retail price in INR/kg")
    retailer_markup_per_kg: Decimal | None = Field(default=None, description="Retailer markup in INR/kg (default ₹30/kg)")
    retail_confirmed_by: str | None = Field(default=None, description="Username of retailer who confirmed pricing")
    retail_confirmed_at: datetime | None = Field(default=None, description="Timestamp of retail price confirmation")

    blockchain_crop_id: int | None
    blockchain_tx_hash: str | None
    blockchain_contract_address: str | None
    blockchain_block_number: int | None
    blockchain_farmer_address: str | None
    blockchain_chain_id: int | None

    created_at: datetime
    updated_at: datetime

    storage_mode: str | None = Field(default="persistent", description="Durability mode: persistent (Supabase) or ephemeral_fallback (/tmp)")
    storage_warning: str | None = Field(default=None, description="Explicit warning if stored in non-persistent fallback storage")


class RetailPriceConfirmRequest(BaseModel):
    markup_per_kg: Decimal = Field(
        default=Decimal("30.00"),
        max_digits=10,
        decimal_places=2,
        description="Fixed retailer markup per kg in INR (must equal 30.00)",
    )

    @field_validator("markup_per_kg")
    @classmethod
    def validate_markup(cls, value: Decimal) -> Decimal:
        if value != Decimal("30.00"):
            raise ValueError("Retailer markup is fixed at ₹30.00/kg by policy and cannot be altered.")
        return value


class FarmerPriceUpdateRequest(BaseModel):
    farmer_price_per_kg: Decimal = Field(
        ...,
        max_digits=10,
        decimal_places=2,
        description="Updated farm-gate price per kg in INR",
    )

    @field_validator("farmer_price_per_kg")
    @classmethod
    def validate_farmer_price(cls, value: Decimal) -> Decimal:
        if value <= Decimal("0"):
            raise ValueError("Farmer price must be a positive number")
        if value < Decimal("1.00"):
            raise ValueError("Farmer price must be at least ₹1.00/kg (e.g. ₹0.50/kg is not a valid price)")
        return value

