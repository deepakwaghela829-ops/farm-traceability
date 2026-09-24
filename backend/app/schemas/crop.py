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

    @field_validator("farmer_id", "crop_name", "crop_type", "unit", "location", mode="before")
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
    created_at: datetime
    updated_at: datetime
