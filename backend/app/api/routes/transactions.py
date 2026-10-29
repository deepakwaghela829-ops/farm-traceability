from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.transaction import TransactionCreate, TransactionRead
from app.services.transaction_service import create_transaction, list_transactions

router = APIRouter(prefix="/api/transactions", tags=["Supply Chain Transactions"])


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def record_transaction(payload: TransactionCreate, db: Session = Depends(get_db)) -> TransactionRead:
    try:
        return create_transaction(db, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save blockchain transaction record",
        ) from exc


@router.get("/chain/{blockchain_crop_id}", response_model=list[TransactionRead])
def get_crop_transactions_by_chain(
    blockchain_crop_id: int = Path(..., gt=0, description="On-chain smart-contract Crop ID"),
    db: Session = Depends(get_db),
) -> list[TransactionRead]:
    try:
        return list_transactions(db, blockchain_crop_id, id_type="blockchain")
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve crop transaction records",
        ) from exc


@router.get("/{crop_id}", response_model=list[TransactionRead])
def get_crop_transactions(
    crop_id: int = Path(..., gt=0, description="Crop ID"),
    id_type: str = Query("db", description="ID namespace: 'db' (default) or 'blockchain'", pattern="^(db|blockchain)$"),
    db: Session = Depends(get_db),
) -> list[TransactionRead]:
    try:
        return list_transactions(db, crop_id, id_type=id_type)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve crop transaction records",
        ) from exc
