from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crop import Crop
from app.schemas.crop import CropCreate


def create_crop(db: Session, payload: CropCreate) -> Crop:
    crop = Crop(**payload.model_dump())
    db.add(crop)
    db.commit()
    db.refresh(crop)
    return crop


def list_crops(db: Session, farmer_id: str) -> list[Crop]:
    statement = select(Crop).where(Crop.farmer_id == farmer_id).order_by(Crop.created_at.desc(), Crop.crop_id.desc())
    return list(db.scalars(statement).all())
