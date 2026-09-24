from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.crop import CropCreate, CropRead
from app.services.crop_service import create_crop, list_crops

router = APIRouter(prefix="/api/crops", tags=["Crop Info Management"])


@router.post("", response_model=CropRead, status_code=status.HTTP_201_CREATED)
def create_crop_record(payload: CropCreate, db: Session = Depends(get_db)) -> CropRead:
    try:
        return create_crop(db, payload)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to save crop record") from exc


@router.get("", response_model=list[CropRead])
def get_crop_records(
    farmer_id: str = Query(min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> list[CropRead]:
    try:
        return list_crops(db, farmer_id.strip())
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Unable to retrieve crop records") from exc
