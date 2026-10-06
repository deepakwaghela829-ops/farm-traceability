import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crop import Crop
from app.schemas.crop import CropCreate

logger = logging.getLogger(__name__)


def create_crop(db: Session, payload: CropCreate) -> Crop:
    crop = Crop(**payload.model_dump())
    db.add(crop)
    db.commit()
    db.refresh(crop)

    # Automatically generate and persist AI price prediction for the registered crop
    # using crop metadata + ML dataset market benchmarks without requiring manual entry
    try:
        from app.services.prediction_service import get_or_create_crop_prediction

        target_crop_id = crop.blockchain_crop_id if crop.blockchain_crop_id else crop.crop_id
        get_or_create_crop_prediction(db, target_crop_id)
    except Exception as err:
        logger.warning(f"Could not auto-generate prediction for crop {crop.crop_id}: {err}")

    return crop


def list_crops(db: Session, farmer_id: str | None = None) -> list[Crop]:
    if farmer_id:
        statement = select(Crop).where(Crop.farmer_id == farmer_id).order_by(Crop.created_at.desc(), Crop.crop_id.desc())
    else:
        statement = select(Crop).order_by(Crop.created_at.desc(), Crop.crop_id.desc())
    return list(db.scalars(statement).all())


def get_crop_by_id(db: Session, crop_id: int) -> Crop | None:
    statement = select(Crop).where((Crop.crop_id == crop_id) | (Crop.blockchain_crop_id == crop_id))
    return db.scalars(statement).first()
