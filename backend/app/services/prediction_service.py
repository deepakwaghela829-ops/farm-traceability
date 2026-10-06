from datetime import datetime
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.predictor import get_market_benchmarks, predict_price
from app.models.crop import Crop
from app.models.prediction import ConsumerAcknowledgement, CropPrediction
from app.schemas.prediction import PricePredictionRequest, PricePredictionResponse


def resolve_features_for_crop(
    crop_name_or_type: str,
    location: str | None = None,
    quantity: float | None = None,
    date_obj: datetime | None = None,
) -> dict:
    benchmarks = get_market_benchmarks()
    key = crop_name_or_type.strip().lower()

    crop_bench = benchmarks.get(key)
    if not crop_bench:
        # Fallback to default
        crop_bench = benchmarks.get("__default__", {
            "crop_type": crop_name_or_type,
            "avg_historical_price": 3000.0,
            "avg_demand": 0.75,
            "default_season": "Monsoon",
            "default_location": "Palghar",
            "avg_production_quantity": 500.0,
        })

    # Resolve season based on date if provided
    season = crop_bench["default_season"]
    if date_obj:
        month = date_obj.month
        if month in [6, 7, 8, 9]:
            season = "Monsoon"
        elif month in [10, 11, 12, 1, 2]:
            season = "Winter"
        else:
            season = "Summer"

    loc = location.strip() if location else crop_bench["default_location"]
    # If location has commas, take first part (e.g. "Palghar, Maharashtra" -> "Palghar")
    loc_clean = loc.split(",")[0].strip()
    if not loc_clean:
        loc_clean = crop_bench["default_location"]

    qty = float(quantity) if quantity and quantity > 0 else crop_bench["avg_production_quantity"]

    return {
        "crop_type": crop_bench.get("crop_type", crop_name_or_type),
        "historical_price": crop_bench["avg_historical_price"],
        "season": season,
        "location": loc_clean,
        "demand": crop_bench["avg_demand"],
        "production_quantity": qty,
    }


def generate_and_save_prediction(
    db: Session,
    request: PricePredictionRequest,
) -> PricePredictionResponse:
    predicted_val = predict_price(
        crop_type=request.crop_type.strip(),
        historical_price=request.historical_price,
        season=request.season.strip(),
        location=request.location.strip(),
        demand=request.demand,
        production_quantity=request.production_quantity,
    )

    now = datetime.now()
    pred_date_str = now.strftime("%d/%m/%Y")

    if request.crop_id is not None:
        prediction_record = CropPrediction(
            crop_id=request.crop_id,
            crop_type=request.crop_type.strip(),
            historical_price=request.historical_price,
            season=request.season.strip(),
            location=request.location.strip(),
            demand=request.demand,
            production_quantity=request.production_quantity,
            predicted_price=predicted_val,
            model_name="Random Forest Regressor",
            currency="INR",
            unit=request.unit.strip() if request.unit else "kg",
        )
        db.add(prediction_record)
        db.commit()
        db.refresh(prediction_record)
        pred_date_str = prediction_record.created_at.strftime("%d/%m/%Y")

    return PricePredictionResponse(
        predicted_price=predicted_val,
        currency="INR",
        unit=request.unit.strip() if request.unit else "kg",
        model_name="Random Forest Regressor",
        prediction_date=pred_date_str,
        crop_id=request.crop_id,
        crop_type=request.crop_type.strip(),
        historical_price=request.historical_price,
        season=request.season.strip(),
        location=request.location.strip(),
        demand=request.demand,
        production_quantity=request.production_quantity,
    )


def get_or_create_crop_prediction(
    db: Session,
    crop_id: int,
) -> PricePredictionResponse | None:
    # Check if prediction already saved for crop_id
    stmt = (
        select(CropPrediction)
        .where(CropPrediction.crop_id == crop_id)
        .order_by(CropPrediction.created_at.desc(), CropPrediction.id.desc())
    )
    existing = db.scalars(stmt).first()
    if existing:
        return PricePredictionResponse(
            predicted_price=existing.predicted_price,
            currency=existing.currency,
            unit=existing.unit,
            model_name=existing.model_name,
            prediction_date=existing.created_at.strftime("%d/%m/%Y"),
            crop_id=existing.crop_id,
            crop_type=existing.crop_type,
            historical_price=existing.historical_price,
            season=existing.season,
            location=existing.location,
            demand=existing.demand,
            production_quantity=existing.production_quantity,
        )

    # Check if crop exists in crops table by blockchain_crop_id or crop_id
    crop_stmt = (
        select(Crop)
        .where((Crop.blockchain_crop_id == crop_id) | (Crop.crop_id == crop_id))
        .order_by(Crop.crop_id.desc())
    )
    crop = db.scalars(crop_stmt).first()

    crop_name = crop.crop_name if crop else "Banana"
    location = crop.location if crop else "Palghar"
    quantity = float(crop.quantity) if crop else 500.0
    unit = crop.unit if crop else "kg"
    cultivation_date = crop.cultivation_date if crop else None

    # Resolve features automatically from ML dataset benchmarks
    features = resolve_features_for_crop(
        crop_name_or_type=crop_name,
        location=location,
        quantity=quantity,
        date_obj=datetime.combine(cultivation_date, datetime.min.time()) if cultivation_date else None,
    )

    # Generate and persist prediction
    req = PricePredictionRequest(
        crop_id=crop_id,
        crop_type=features["crop_type"],
        historical_price=features["historical_price"],
        season=features["season"],
        location=features["location"],
        demand=features["demand"],
        production_quantity=features["production_quantity"],
        unit=unit,
    )
    return generate_and_save_prediction(db, req)


def record_consumer_acknowledgement(
    db: Session,
    crop_id: int,
    acknowledged: bool,
) -> ConsumerAcknowledgement:
    ack = ConsumerAcknowledgement(
        crop_id=crop_id,
        acknowledged=acknowledged,
    )
    db.add(ack)
    db.commit()
    db.refresh(ack)
    return ack


def get_consumer_acknowledgement(
    db: Session,
    crop_id: int,
) -> ConsumerAcknowledgement | None:
    stmt = (
        select(ConsumerAcknowledgement)
        .where(ConsumerAcknowledgement.crop_id == crop_id)
        .order_by(ConsumerAcknowledgement.acknowledged_at.desc(), ConsumerAcknowledgement.id.desc())
    )
    return db.scalars(stmt).first()
