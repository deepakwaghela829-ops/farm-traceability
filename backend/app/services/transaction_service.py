from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate


def create_transaction(db: Session, payload: TransactionCreate) -> Transaction:
    transaction = Transaction(**payload.model_dump())
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def list_transactions(db: Session, crop_id: int) -> list[Transaction]:
    from app.models.crop import Crop

    target_ids = {crop_id}
    crop = db.scalars(
        select(Crop).where((Crop.crop_id == crop_id) | (Crop.blockchain_crop_id == crop_id))
    ).first()

    if crop:
        target_ids.add(crop.crop_id)
        if crop.blockchain_crop_id:
            target_ids.add(crop.blockchain_crop_id)

    statement = (
        select(Transaction)
        .where(Transaction.crop_id.in_(list(target_ids)))
        .order_by(Transaction.timestamp.asc(), Transaction.id.asc())
    )
    return list(db.scalars(statement).all())

