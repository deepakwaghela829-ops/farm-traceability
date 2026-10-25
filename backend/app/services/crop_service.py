from decimal import Decimal
import logging
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.crop import Crop
from app.schemas.crop import CropCreate

logger = logging.getLogger(__name__)

FIXED_RETAILER_MARKUP = Decimal("30.00")


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

    # Explicitly track whether the record was saved to permanent PostgreSQL or temporary fallback
    from app.db import check_database_health
    db_health = check_database_health()
    if db_health.get("storage_mode") == "ephemeral_fallback":
        crop.storage_mode = "ephemeral_fallback"
        crop.storage_warning = db_health.get("notice")
        logger.warning(f"Crop #{crop.crop_id} saved to ephemeral fallback storage (/tmp). Record is NOT permanent.")
    else:
        crop.storage_mode = "persistent"
        crop.storage_warning = None

    return crop


def list_crops(db: Session, farmer_id: str | None = None) -> list[Crop]:
    if farmer_id:
        statement = select(Crop).where(Crop.farmer_id == farmer_id).order_by(Crop.created_at.desc(), Crop.crop_id.desc())
    else:
        statement = select(Crop).order_by(Crop.created_at.desc(), Crop.crop_id.desc())
    return list(db.scalars(statement).all())


def get_crop_by_id(db: Session, crop_id: int) -> Crop | None:
    crop = db.scalars(select(Crop).where(Crop.crop_id == crop_id)).first()
    if crop:
        return crop
    return db.scalars(select(Crop).where(Crop.blockchain_crop_id == crop_id)).first()


def is_crop_received_by_retailer(db: Session, crop: Crop) -> bool:
    """Checks whether the crop has been received into retailer inventory via transactions table."""
    from app.models.transaction import Transaction

    crop_ids = [cid for cid in [crop.crop_id, crop.blockchain_crop_id] if cid is not None]
    if not crop_ids:
        return False

    stmt = select(Transaction).where(
        Transaction.crop_id.in_(crop_ids),
        (Transaction.event_type == "RECEIVE") | (func.lower(Transaction.to_role).like("%retailer%")),
    )
    return db.scalars(stmt).first() is not None


def confirm_retail_price(
    db: Session,
    crop_id: int,
    retailer_username: str,
    markup_per_kg: Decimal = FIXED_RETAILER_MARKUP,
) -> Crop:
    crop = get_crop_by_id(db, crop_id)
    if not crop:
        raise LookupError(f"Crop #{crop_id} not found")

    if crop.farmer_price_per_kg is None or crop.farmer_price_per_kg < Decimal("1.00"):
        raise ValueError("Cannot confirm retail price: Farm-gate price has not been set by farmer.")

    if not is_crop_received_by_retailer(db, crop):
        raise ValueError("Cannot confirm retail price: Crop has not been received into retailer inventory yet.")

    if markup_per_kg != FIXED_RETAILER_MARKUP:
        raise ValueError("Retailer markup is fixed at ₹30.00/kg by policy and cannot be altered.")

    crop.retailer_markup_per_kg = FIXED_RETAILER_MARKUP
    crop.retail_price_per_kg = crop.farmer_price_per_kg + FIXED_RETAILER_MARKUP
    crop.retail_confirmed_by = retailer_username
    crop.retail_confirmed_at = func.now()

    db.commit()
    db.refresh(crop)
    return crop


def update_farmer_price(
    db: Session,
    crop_id: int,
    farmer_id: str,
    new_price: Decimal,
    is_admin: bool = False,
) -> Crop:
    crop = get_crop_by_id(db, crop_id)
    if not crop:
        raise LookupError(f"Crop #{crop_id} not found")

    if not is_admin and crop.farmer_id != farmer_id:
        raise PermissionError("Not authorized to update price for crops belonging to another farmer.")

    if new_price < Decimal("1.00"):
        raise ValueError("Farmer price must be at least ₹1.00/kg.")

    crop.farmer_price_per_kg = new_price
    if crop.retail_price_per_kg is not None:
        crop.retailer_markup_per_kg = FIXED_RETAILER_MARKUP
        crop.retail_price_per_kg = new_price + FIXED_RETAILER_MARKUP

    db.commit()
    db.refresh(crop)
    return crop

