import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture
def client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def test_create_and_get_transaction(client):
    payload = {
        "crop_id": 1,
        "event_type": "TRANSFER",
        "from_address": "0xa5c5A997d004B8D3294E48b8494996B703E9513E",
        "to_address": "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
        "to_role": "Supplier",
        "transaction_hash": "0x" + "a" * 64,
        "block_number": 10,
        "timestamp": "2026-10-03T12:00:00Z",
    }
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["crop_id"] == 1
    assert data["to_role"] == "Supplier"
    assert data["block_number"] == 10

    get_resp = client.get("/api/transactions/1")
    assert get_resp.status_code == 200
    txs = get_resp.json()
    assert len(txs) == 1
    assert txs[0]["to_role"] == "Supplier"


def test_transactions_ordered_chronologically(client):
    tx1 = {
        "crop_id": 1,
        "event_type": "TRANSFER",
        "from_address": "0xa5c5A997d004B8D3294E48b8494996B703E9513E",
        "to_address": "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
        "to_role": "Supplier",
        "transaction_hash": "0x" + "1" * 64,
        "block_number": 10,
        "timestamp": "2026-10-03T10:00:00Z",
    }
    tx2 = {
        "crop_id": 1,
        "event_type": "TRANSFER",
        "from_address": "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
        "to_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "to_role": "Retailer",
        "transaction_hash": "0x" + "2" * 64,
        "block_number": 11,
        "timestamp": "2026-10-03T11:00:00Z",
    }
    client.post("/api/transactions", json=tx1)
    client.post("/api/transactions", json=tx2)

    get_resp = client.get("/api/transactions/1")
    assert get_resp.status_code == 200
    txs = get_resp.json()
    assert len(txs) == 2
    assert txs[0]["to_role"] == "Supplier"
    assert txs[1]["to_role"] == "Retailer"
