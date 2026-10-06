from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.ai.predictor import get_market_benchmarks, predict_price
from app.db import get_db
from app.schemas.prediction import (
    AcknowledgementRequest,
    AcknowledgementResponse,
    BenchmarkFeaturesResponse,
    PricePredictionRequest,
    PricePredictionResponse,
)
from app.services.prediction_service import (
    generate_and_save_prediction,
    get_consumer_acknowledgement,
    get_or_create_crop_prediction,
    record_consumer_acknowledgement,
    resolve_features_for_crop,
)

router = APIRouter(prefix="/api/prediction", tags=["AI Price Prediction"])


@router.post("/price", response_model=PricePredictionResponse)
def predict_crop_price(
    request: PricePredictionRequest,
    db: Session = Depends(get_db),
) -> PricePredictionResponse:
    try:
        return generate_and_save_prediction(db, request)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Price prediction calculation failed: {str(err)}",
        )


@router.get("/benchmarks/{crop_type}", response_model=BenchmarkFeaturesResponse)
def get_crop_benchmarks(
    crop_type: str = Path(..., min_length=1, description="Crop name or type"),
) -> BenchmarkFeaturesResponse:
    try:
        features = resolve_features_for_crop(crop_name_or_type=crop_type)
        return BenchmarkFeaturesResponse(**features)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to resolve crop benchmarks: {str(err)}",
        )


@router.get("/crop/{crop_id}", response_model=PricePredictionResponse)
def get_prediction_for_crop(
    crop_id: int = Path(..., gt=0, description="Crop ID (Blockchain or DB)"),
    db: Session = Depends(get_db),
) -> PricePredictionResponse:
    try:
        prediction = get_or_create_crop_prediction(db, crop_id)
        if not prediction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No prediction found or could be generated for Crop #{crop_id}",
            )
        return prediction
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch crop prediction: {str(err)}",
        )


@router.post("/acknowledge/{crop_id}", response_model=AcknowledgementResponse)
def acknowledge_forecast(
    crop_id: int = Path(..., gt=0, description="Crop ID"),
    payload: AcknowledgementRequest = AcknowledgementRequest(),
    db: Session = Depends(get_db),
) -> AcknowledgementResponse:
    try:
        ack = record_consumer_acknowledgement(db, crop_id, payload.acknowledged)
        return AcknowledgementResponse.model_validate(ack)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record consumer acknowledgement: {str(err)}",
        )


@router.get("/acknowledge/{crop_id}", response_model=AcknowledgementResponse | None)
def check_acknowledgement(
    crop_id: int = Path(..., gt=0, description="Crop ID"),
    db: Session = Depends(get_db),
) -> AcknowledgementResponse | None:
    try:
        ack = get_consumer_acknowledgement(db, crop_id)
        if ack:
            return AcknowledgementResponse.model_validate(ack)
        return None
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check acknowledgement status: {str(err)}",
        )
