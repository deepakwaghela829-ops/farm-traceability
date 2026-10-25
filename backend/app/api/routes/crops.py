from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.crop import CropCreate, CropRead, FarmerPriceUpdateRequest, RetailPriceConfirmRequest
from app.services.crop_service import (
    confirm_retail_price,
    create_crop,
    get_crop_by_id,
    list_crops,
    update_farmer_price,
)

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
    farmer_id: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
) -> list[CropRead]:
    try:
        cleaned_farmer_id = farmer_id.strip() if farmer_id else None
        return list_crops(db, cleaned_farmer_id)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Unable to retrieve crop records") from exc


@router.get("/{crop_id}", response_model=CropRead)
def get_crop_record(
    crop_id: int,
    db: Session = Depends(get_db),
) -> CropRead:
    try:
        crop = get_crop_by_id(db, crop_id)
        if not crop:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Crop #{crop_id} not found")
        return crop
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Unable to retrieve crop record") from exc


@router.post("/{crop_id}/confirm-retail-price", response_model=CropRead)
def confirm_crop_retail_price(
    crop_id: int,
    payload: RetailPriceConfirmRequest = RetailPriceConfirmRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CropRead:
    if current_user.role.upper() not in ("RETAILER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Retailers or Admins can confirm retail prices.",
        )
    try:
        return confirm_retail_price(
            db=db,
            crop_id=crop_id,
            retailer_username=current_user.username,
            markup_per_kg=payload.markup_per_kg,
        )
    except LookupError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to confirm retail price") from exc


@router.patch("/{crop_id}/farmer-price", response_model=CropRead)
def update_crop_farmer_price(
    crop_id: int,
    payload: FarmerPriceUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CropRead:
    is_admin = current_user.role.upper() == "ADMIN"
    if current_user.role.upper() not in ("FARMER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Farmers or Admins can update farm-gate price.",
        )
    try:
        return update_farmer_price(
            db=db,
            crop_id=crop_id,
            farmer_id=current_user.username,
            new_price=payload.farmer_price_per_kg,
            is_admin=is_admin,
        )
    except LookupError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except PermissionError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update farmer price") from exc
