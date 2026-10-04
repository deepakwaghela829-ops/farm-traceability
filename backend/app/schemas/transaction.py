from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TransactionCreate(BaseModel):
    crop_id: int = Field(gt=0)
    event_type: str = Field(default="TRANSFER", min_length=1, max_length=50)
    from_address: str = Field(min_length=42, max_length=42)
    to_address: str = Field(min_length=42, max_length=42)
    to_role: str = Field(min_length=1, max_length=50)
    transaction_hash: str = Field(min_length=66, max_length=66)
    block_number: int = Field(ge=0)
    timestamp: datetime

    @field_validator(
        "from_address",
        "to_address",
        "transaction_hash",
        "to_role",
        "event_type",
        mode="before",
    )
    @classmethod
    def clean_text(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("must be text")
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: int | float | str | datetime) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            # UNIX timestamp in seconds
            return datetime.fromtimestamp(value, tz=timezone.utc)
        if isinstance(value, str):
            value = value.strip()
            # If purely numeric string, treat as unix timestamp
            if value.isdigit():
                return datetime.fromtimestamp(int(value), tz=timezone.utc)
            # Try ISO format
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                pass
        raise ValueError("Invalid timestamp format. Expected ISO string or UNIX timestamp in seconds.")


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    crop_id: int
    event_type: str
    from_address: str
    to_address: str
    to_role: str
    transaction_hash: str
    block_number: int
    timestamp: datetime
    created_at: datetime
