from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate


def create_transaction(db: Session, payload: TransactionCreate) -> Transaction:
    from app.models.crop import Crop

    data = payload.model_dump()
    id_type = data.pop("id_type", "db")

    if id_type == "blockchain":
        crop = db.scalars(select(Crop).where(Crop.blockchain_crop_id == payload.crop_id)).first()
        if crop:
            data["crop_id"] = crop.crop_id
    else:
        # id_type == "db"
        crop = db.scalars(select(Crop).where(Crop.crop_id == payload.crop_id)).first()
        if crop:
            data["crop_id"] = crop.crop_id

    transaction = Transaction(**data)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def list_transactions(db: Session, crop_id: int, id_type: str = "db") -> list[Transaction]:
    from app.models.crop import Crop

    if id_type == "blockchain":
        crop = db.scalars(select(Crop).where(Crop.blockchain_crop_id == crop_id)).first()
        if not crop:
            return []
        target_crop_id = crop.crop_id
    else:
        # id_type == "db"
        target_crop_id = crop_id

    statement = (
        select(Transaction)
        .where(Transaction.crop_id == target_crop_id)
        .order_by(Transaction.timestamp.asc(), Transaction.id.asc())
    )
    return list(db.scalars(statement).all())
