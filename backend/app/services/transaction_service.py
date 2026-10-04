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
    statement = (
        select(Transaction)
        .where(Transaction.crop_id == crop_id)
        .order_by(Transaction.timestamp.asc(), Transaction.id.asc())
    )
    return list(db.scalars(statement).all())
