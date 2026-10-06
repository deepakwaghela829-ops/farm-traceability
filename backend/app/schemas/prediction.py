from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class PricePredictionRequest(BaseModel):
    crop_id: int | None = Field(
        default=None,
        description="Optional associated Crop ID (e.g. from PostgreSQL or Blockchain)",
    )
    crop_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Crop name/type, e.g. Banana, Tomato, Onion",
    )
    historical_price: float = Field(
        ...,
        gt=0,
        description="Historical benchmark price per unit/quintal (e.g. 4500)",
    )
    season: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Cultivation/market season, e.g. Monsoon, Winter, Summer",
    )
    location: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="District/location, e.g. Palghar, Nashik",
    )
    demand: float = Field(
        ...,
        gt=0,
        le=5.0,
        description="Market demand index (e.g. 0.8)",
    )
    production_quantity: float = Field(
        ...,
        gt=0,
        description="Estimated production quantity in kg/quintals (e.g. 500)",
    )
    unit: str = Field(
        default="kg",
        max_length=20,
        description="Unit of measurement",
    )


class PricePredictionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    predicted_price: float = Field(..., description="Predicted crop price estimate")
    currency: str = Field(default="INR", description="Currency symbol/code")
    unit: str = Field(default="kg", description="Unit")
    model_name: str = Field(default="Random Forest Regressor", description="Model name")
    prediction_date: str = Field(..., description="Date of prediction in DD/MM/YYYY or ISO format")
    crop_id: int | None = Field(default=None, description="Associated Crop ID")
    crop_type: str = Field(..., description="Crop type")
    historical_price: float = Field(..., description="Historical price feature")
    season: str = Field(..., description="Season feature")
    location: str = Field(..., description="Location feature")
    demand: float = Field(..., description="Demand feature")
    production_quantity: float = Field(..., description="Production quantity feature")


class BenchmarkFeaturesResponse(BaseModel):
    crop_type: str
    historical_price: float
    demand: float
    season: str
    location: str
    production_quantity: float


class AcknowledgementRequest(BaseModel):
    acknowledged: bool = Field(default=True, description="Acknowledgment boolean")


class AcknowledgementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    crop_id: int
    acknowledged: bool
    acknowledged_at: datetime
