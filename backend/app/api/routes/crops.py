from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.crop import (
    CropCreate,
    CropRead,
    FarmerPriceUpdateRequest,
    RetailPriceConfirmRequest,
    SupplierMarginConfirmRequest,
)
from sqlalchemy.exc import IntegrityError
from app.services.crop_service import (
    confirm_retail_price,
    get_crop_by_blockchain_id,
    get_crop_by_batch_number,
    confirm_supplier_margin,
    create_crop,
    get_crop_by_id,
    list_crops,
    mark_crop_available,
    mark_crop_unavailable,
    receive_crop,
    update_farmer_price,
)

router = APIRouter(prefix="/api/crops", tags=["Crop Info Management"])


@router.post("", response_model=CropRead, status_code=status.HTTP_201_CREATED)
def create_crop_record(payload: CropCreate, db: Session = Depends(get_db)) -> CropRead:
    try:
        return create_crop(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Batch number must be unique.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to save crop record") from exc


@router.get("", response_model=list[CropRead])
def get_crop_records(
    farmer_id: str | None = Query(default=None, max_length=64),
    available_only: bool = Query(default=False, description="Filter for active store inventory"),
    batch_number: str | None = Query(default=None, max_length=32, description="Filter by explicit batch code"),
    db: Session = Depends(get_db),
) -> list[CropRead]:
    try:
        cleaned_farmer_id = farmer_id.strip() if farmer_id else None
        return list_crops(db, cleaned_farmer_id, available_only=available_only, batch_number=batch_number)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Unable to retrieve crop records") from exc


@router.get("/chain/{blockchain_crop_id}", response_model=CropRead)
def get_crop_record_by_blockchain_id(
    blockchain_crop_id: int = Path(..., gt=0, description="On-chain smart-contract Crop ID"),
    db: Session = Depends(get_db),
) -> CropRead:
    crop = get_crop_by_blockchain_id(db, blockchain_crop_id)
    if not crop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crop with on-chain ID #{blockchain_crop_id} not found",
        )
    return crop


@router.get("/batch/{batch_number}", response_model=CropRead)
def get_crop_by_batch(
    batch_number: str,
    db: Session = Depends(get_db),
) -> CropRead:
    crop = get_crop_by_batch_number(db, batch_number)
    if not crop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Batch '{batch_number}' not found")
    return crop


@router.get("/{crop_id}", response_model=CropRead)
def get_crop_record(
    crop_id: int,
    id_type: str = Query("db", description="ID namespace: 'db' (database crop_id, default) or 'blockchain' (on-chain crop_id)", pattern="^(db|blockchain)$"),
    db: Session = Depends(get_db),
) -> CropRead:
    try:
        if id_type == "blockchain":
            crop = get_crop_by_blockchain_id(db, crop_id)
        else:
            crop = get_crop_by_id(db, crop_id)

        if not crop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Crop with {id_type} ID #{crop_id} not found",
            )
        return crop
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Unable to retrieve crop record") from exc


@router.post("/{crop_id}/receive", response_model=CropRead)
def receive_crop_consignment(
    crop_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CropRead:
    """Retailer receives produce batch into active store inventory."""
    if current_user.role.upper() not in ("RETAILER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Retailers or Admins can receive consignments.",
        )
    try:
        return receive_crop(
            db=db,
            crop_id=crop_id,
            retailer_username=current_user.username,
            retailer_address=current_user.wallet_address,
        )
    except LookupError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to record crop receipt") from exc


@router.post("/{crop_id}/mark-unavailable", response_model=CropRead)
def remove_crop_from_inventory(
    crop_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CropRead:
    """Soft-removes a crop from active retailer store inventory while preserving provenance."""
    if current_user.role.upper() not in ("RETAILER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Retailers or Admins can mark inventory unavailable.",
        )
    try:
        return mark_crop_unavailable(db=db, crop_id=crop_id, user_role=current_user.role)
    except LookupError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except PermissionError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to mark crop unavailable") from exc


@router.post("/{crop_id}/mark-available", response_model=CropRead)
def restore_crop_to_inventory(
    crop_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CropRead:
    """Restores a crop to active retailer store inventory."""
    if current_user.role.upper() not in ("RETAILER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Retailers or Admins can mark inventory available.",
        )
    try:
        return mark_crop_available(db=db, crop_id=crop_id, user_role=current_user.role)
    except LookupError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except PermissionError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to mark crop available") from exc


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


@router.post("/{crop_id}/confirm-supplier-margin", response_model=CropRead)
def confirm_crop_supplier_margin(
    crop_id: int,
    payload: SupplierMarginConfirmRequest = SupplierMarginConfirmRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CropRead:
    if current_user.role.upper() not in ("SUPPLIER", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Suppliers or Admins can confirm supplier margins.",
        )
    try:
        return confirm_supplier_margin(
            db=db,
            crop_id=crop_id,
            supplier_username=current_user.username,
            margin_per_kg=payload.margin_per_kg,
        )
    except LookupError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to confirm supplier margin") from exc


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
