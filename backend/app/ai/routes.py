from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai.predictor import predict_price

router = APIRouter(prefix="/api/prediction", tags=["AI Price Prediction"])


class PricePredictionRequest(BaseModel):
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


class PricePredictionResponse(BaseModel):
    predicted_price: float = Field(
        ...,
        description="Predicted crop price estimate",
    )


@router.post("/price", response_model=PricePredictionResponse)
def predict_crop_price(request: PricePredictionRequest) -> PricePredictionResponse:
    try:
        price = predict_price(
            crop_type=request.crop_type.strip(),
            historical_price=request.historical_price,
            season=request.season.strip(),
            location=request.location.strip(),
            demand=request.demand,
            production_quantity=request.production_quantity,
        )
        return PricePredictionResponse(predicted_price=price)
    except Exception as err:
        raise HTTPException(
            status_code=500,
            detail=f"Price prediction calculation failed: {str(err)}",
        )
