from decimal import Decimal
import logging
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.crop import Crop
from app.schemas.crop import CropCreate

logger = logging.getLogger(__name__)

DEFAULT_SUPPLIER_MARGIN = Decimal("15.00")
FIXED_RETAILER_MARKUP = Decimal("30.00")


def create_crop(db: Session, payload: CropCreate) -> Crop:
    # 1. Safe API validation for custom batch_number uniqueness
    clean_batch = None
    if payload.batch_number:
        clean_batch = payload.batch_number.strip()
        existing = db.scalars(
            select(Crop).where(func.lower(Crop.batch_number) == clean_batch.lower())
        ).first()
        if existing:
            raise ValueError(f"Batch number '{clean_batch}' is already in use by Crop #{existing.crop_id}")

    crop_data = payload.model_dump()

    # Determine batch_number if not provided
    if not clean_batch:
        max_id = db.scalar(select(func.max(Crop.crop_id))) or 0
        clean_batch = f"BATCH-2026-{(max_id + 1):05d}"
        crop_data["batch_number"] = clean_batch

    # Automatically generate readable display label if crop_name was omitted
    # Format: CropType — BATCH-YYYY-XXXXX (e.g. Mango — BATCH-2026-00001)
    if not crop_data.get("crop_name"):
        crop_data["crop_name"] = f"{payload.crop_type} — {clean_batch}"

    crop = Crop(**crop_data)
    if crop.farmer_price_per_kg is not None:
        if crop.supplier_margin_per_kg is None:
            crop.supplier_margin_per_kg = DEFAULT_SUPPLIER_MARGIN
        crop.supplier_price_per_kg = crop.farmer_price_per_kg + crop.supplier_margin_per_kg
    db.add(crop)
    db.commit()
    db.refresh(crop)

    # 2. Sync auto-generated batch_number and display label with the actual committed crop_id
    if payload.batch_number is None:
        actual_batch = f"BATCH-2026-{crop.crop_id:05d}"
        needs_commit = False
        if crop.batch_number != actual_batch:
            crop.batch_number = actual_batch
            needs_commit = True
        if payload.crop_name is None:
            expected_name = f"{crop.crop_type} — {crop.batch_number}"
            if crop.crop_name != expected_name:
                crop.crop_name = expected_name
                needs_commit = True
        if needs_commit:
            db.commit()
            db.refresh(crop)
    elif payload.crop_name is None:
        expected_name = f"{crop.crop_type} — {crop.batch_number}"
        if crop.crop_name != expected_name:
            crop.crop_name = expected_name
            db.commit()
            db.refresh(crop)

    # 3. Automatically generate and persist AI price prediction for the registered crop
    try:
        from app.services.prediction_service import get_or_create_crop_prediction

        get_or_create_crop_prediction(db, crop.crop_id, id_type="db")
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


def list_crops(
    db: Session,
    farmer_id: str | None = None,
    available_only: bool = False,
    batch_number: str | None = None,
) -> list[Crop]:
    conditions = []
    if farmer_id:
        conditions.append(Crop.farmer_id == farmer_id)
    if available_only:
        conditions.append(Crop.is_available.is_(True))
    if batch_number:
        conditions.append(Crop.batch_number == batch_number.strip())

    statement = select(Crop)
    if conditions:
        statement = statement.where(*conditions)
    statement = statement.order_by(Crop.created_at.desc(), Crop.crop_id.desc())
    return list(db.scalars(statement).all())


def get_crop_by_id(db: Session, crop_id: int) -> Crop | None:
    """Strictly look up crop by database primary key. Zero ambiguous fallback."""
    return db.scalars(select(Crop).where(Crop.crop_id == crop_id)).first()


def get_crop_by_blockchain_id(db: Session, blockchain_crop_id: int) -> Crop | None:
    """Strictly look up crop by smart-contract on-chain ID."""
    return db.scalars(select(Crop).where(Crop.blockchain_crop_id == blockchain_crop_id)).first()


def get_crop_by_batch_number(db: Session, batch_number: str) -> Crop | None:
    """Strictly look up crop by unique batch number (case-insensitive)."""
    clean_batch = batch_number.strip()
    return db.scalars(select(Crop).where(func.lower(Crop.batch_number) == clean_batch.lower())).first()


def is_crop_received_by_retailer(db: Session, crop: Crop) -> bool:
    """Checks whether the crop has been received into retailer inventory via column or transactions table."""
    if getattr(crop, "retailer_received_at", None) is not None:
        return True

    from app.models.transaction import Transaction

    stmt = select(Transaction).where(
        Transaction.crop_id == crop.crop_id,
        (Transaction.event_type == "RECEIVE") | (func.lower(Transaction.to_role).like("%retailer%")),
    )
    return db.scalars(stmt).first() is not None


def receive_crop(
    db: Session,
    crop_id: int,
    retailer_username: str,
    retailer_address: str | None = None,
) -> Crop:
    """Records retailer physical receipt of produce consignment into active store inventory."""
    crop = get_crop_by_id(db, crop_id)
    if not crop:
        raise LookupError(f"Crop #{crop_id} not found")

    crop.retailer_received_at = func.now()
    crop.retailer_received_by = retailer_username
    crop.is_available = True

    # Record receipt transaction in transactions table if not already logged
    from app.models.transaction import Transaction

    existing_receive = db.scalars(
        select(Transaction).where(
            Transaction.crop_id == crop.crop_id,
            Transaction.event_type == "RECEIVE",
        )
    ).first()

    if not existing_receive:
        rx_tx = Transaction(
            crop_id=crop.crop_id,
            event_type="RECEIVE",
            from_address="0x" + "0" * 40,
            to_address=retailer_address or "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b",
            to_role="Retailer",
            transaction_hash="0x" + "0" * 64,
            block_number=0,
            timestamp=func.now(),
        )
        db.add(rx_tx)

    db.commit()
    db.refresh(crop)
    return crop


def mark_crop_unavailable(db: Session, crop_id: int, user_role: str) -> Crop:
    """Soft-removes a crop from active store inventory while preserving all traceability provenance."""
    if user_role.upper() not in ("RETAILER", "ADMIN"):
        raise PermissionError("Only Retailers or Admins can mark inventory unavailable.")

    crop = get_crop_by_id(db, crop_id)
    if not crop:
        raise LookupError(f"Crop #{crop_id} not found")

    crop.is_available = False
    db.commit()
    db.refresh(crop)
    return crop


def mark_crop_available(db: Session, crop_id: int, user_role: str) -> Crop:
    """Restores a crop to active store inventory."""
    if user_role.upper() not in ("RETAILER", "ADMIN"):
        raise PermissionError("Only Retailers or Admins can mark inventory available.")

    crop = get_crop_by_id(db, crop_id)
    if not crop:
        raise LookupError(f"Crop #{crop_id} not found")

    crop.is_available = True
    db.commit()
    db.refresh(crop)
    return crop


def confirm_supplier_margin(
    db: Session,
    crop_id: int,
    supplier_username: str,
    margin_per_kg: Decimal = DEFAULT_SUPPLIER_MARGIN,
) -> Crop:
    """Confirms or updates supplier gross margin and derives supplier sale price to retailer."""
    crop = get_crop_by_id(db, crop_id)
    if not crop:
        raise LookupError(f"Crop #{crop_id} not found")

    if margin_per_kg <= Decimal("0"):
        raise ValueError("Supplier gross margin must be a positive number.")

    crop.supplier_margin_per_kg = margin_per_kg
    if crop.farmer_price_per_kg is not None:
        crop.supplier_price_per_kg = crop.farmer_price_per_kg + margin_per_kg
        if crop.retail_price_per_kg is not None:
            markup = crop.retailer_markup_per_kg or FIXED_RETAILER_MARKUP
            crop.retail_price_per_kg = crop.supplier_price_per_kg + markup

    db.commit()
    db.refresh(crop)
    return crop


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

    supplier_margin = crop.supplier_margin_per_kg if crop.supplier_margin_per_kg is not None else DEFAULT_SUPPLIER_MARGIN
    supplier_price = crop.farmer_price_per_kg + supplier_margin

    crop.supplier_margin_per_kg = supplier_margin
    crop.supplier_price_per_kg = supplier_price
    crop.retailer_markup_per_kg = FIXED_RETAILER_MARKUP
    # Consumer Shelf Price = Supplier sale price + Retailer gross margin = Farmer price + Supplier margin + Retailer margin
    crop.retail_price_per_kg = supplier_price + FIXED_RETAILER_MARKUP
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
    supplier_margin = crop.supplier_margin_per_kg if crop.supplier_margin_per_kg is not None else DEFAULT_SUPPLIER_MARGIN
    crop.supplier_margin_per_kg = supplier_margin
    crop.supplier_price_per_kg = new_price + supplier_margin

    if crop.retail_price_per_kg is not None:
        crop.retailer_markup_per_kg = FIXED_RETAILER_MARKUP
        crop.retail_price_per_kg = crop.supplier_price_per_kg + FIXED_RETAILER_MARKUP

    db.commit()
    db.refresh(crop)
    return crop
