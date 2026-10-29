import pytest
from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models.crop import Crop
from app.models.user import User
from app.services.auth_service import hash_password


@pytest.fixture
def regression_client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=test_engine)

    # Seed demo users for authenticated actions
    with TestingSessionLocal() as session:
        farmer = User(
            username="farmer1",
            email="farmer1@test.local",
            hashed_password=hash_password("Demo12345!"),
            role="FARMER",
            wallet_address="0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
        )
        supplier = User(
            username="supplier1",
            email="supplier1@test.local",
            hashed_password=hash_password("Demo12345!"),
            role="SUPPLIER",
            wallet_address="0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0",
        )
        retailer = User(
            username="retailer1",
            email="retailer1@test.local",
            hashed_password=hash_password("Demo12345!"),
            role="RETAILER",
            wallet_address="0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b",
        )
        session.add_all([farmer, supplier, retailer])
        session.commit()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def get_token(client, username):
    res = client.post("/api/auth/login", json={"username": username, "password": "Demo12345!"})
    assert res.status_code == 200
    return res.json()["access_token"]


def test_duplicate_batch_number_api_rejection(regression_client):
    client, _ = regression_client

    payload1 = {
        "farmer_id": "farmer1",
        "crop_name": "Ratnagiri Alphonso Mango",
        "crop_type": "Fruit",
        "quantity": 50,
        "unit": "kg",
        "cultivation_date": "2026-06-01",
        "expected_harvest_date": "2026-10-01",
        "location": "Ratnagiri, Maharashtra",
        "batch_number": "BATCH-REG-001",
    }
    res1 = client.post("/api/crops", json=payload1)
    assert res1.status_code == 201
    assert res1.json()["batch_number"] == "BATCH-REG-001"

    # Attempting to register another crop with the exact same batch_number
    payload2 = {
        "farmer_id": "farmer1",
        "crop_name": "Ratnagiri Alphonso Mango",
        "crop_type": "Fruit",
        "quantity": 100,
        "unit": "kg",
        "cultivation_date": "2026-06-01",
        "expected_harvest_date": "2026-10-01",
        "location": "Ratnagiri, Maharashtra",
        "batch_number": "BATCH-REG-001",
    }
    res2 = client.post("/api/crops", json=payload2)
    assert res2.status_code == 400
    assert "already in use" in res2.json()["detail"].lower()

    # Case-insensitive duplicate rejection
    payload3 = {**payload2, "batch_number": "batch-reg-001"}
    res3 = client.post("/api/crops", json=payload3)
    assert res3.status_code == 400
    assert "already in use" in res3.json()["detail"].lower()


def test_duplicate_batch_number_database_integrity_error(regression_client):
    _, sessionmaker_cls = regression_client

    with sessionmaker_cls() as session:
        c1 = Crop(
            farmer_id="farmer1",
            crop_name="Mango",
            crop_type="Fruit",
            quantity=Decimal("50.000"),
            unit="kg",
            cultivation_date=date(2026, 6, 1),
            expected_harvest_date=date(2026, 10, 1),
            location="Ratnagiri",
            batch_number="BATCH-DB-UNIQUE-TEST",
        )
        session.add(c1)
        session.commit()

        c2 = Crop(
            farmer_id="farmer1",
            crop_name="Mango",
            crop_type="Fruit",
            quantity=Decimal("100.000"),
            unit="kg",
            cultivation_date=date(2026, 6, 1),
            expected_harvest_date=date(2026, 10, 1),
            location="Ratnagiri",
            batch_number="BATCH-DB-UNIQUE-TEST",
        )
        session.add(c2)
        with pytest.raises(IntegrityError):
            session.commit()


def test_overlapping_database_and_blockchain_numeric_ids(regression_client):
    """
    Ensures that when numeric IDs overlap across namespaces (e.g. ID 2 is DB ID for Crop Alpha,
    and on-chain ID for Crop Beta; ID 5 is on-chain ID for Crop Alpha and DB ID for Crop Beta),
    endpoints never infer from a bare integer and resolve unambiguously.
    """
    client, sessionmaker_cls = regression_client

    with sessionmaker_cls() as session:
        # Crop Alpha: DB primary key = 2, blockchain_crop_id = 5
        alpha = Crop(
            crop_id=2,
            farmer_id="farmer1",
            crop_name="Devgad Alphonso Mango",
            crop_type="Fruit",
            quantity=Decimal("50.000"),
            unit="kg",
            cultivation_date=date(2026, 6, 1),
            expected_harvest_date=date(2026, 10, 1),
            location="Devgad",
            blockchain_crop_id=5,
            batch_number="BATCH-ALPHA-002",
        )
        # Crop Beta: DB primary key = 5, blockchain_crop_id = 9
        beta = Crop(
            crop_id=5,
            farmer_id="farmer1",
            crop_name="Himachal Royal Apple",
            crop_type="Fruit",
            quantity=Decimal("200.000"),
            unit="kg",
            cultivation_date=date(2026, 5, 1),
            expected_harvest_date=date(2026, 9, 1),
            location="Shimla",
            blockchain_crop_id=9,
            batch_number="BATCH-BETA-005",
        )
        session.add_all([alpha, beta])
        session.commit()

    # 1. Query ID 5 with default / explicit id_type=db -> MUST return Crop Beta (DB ID 5)
    res_db_5 = client.get("/api/crops/5?id_type=db")
    assert res_db_5.status_code == 200
    assert res_db_5.json()["crop_name"] == "Himachal Royal Apple"
    assert res_db_5.json()["crop_id"] == 5

    res_default_5 = client.get("/api/crops/5")
    assert res_default_5.status_code == 200
    assert res_default_5.json()["crop_name"] == "Himachal Royal Apple"
    assert res_default_5.json()["crop_id"] == 5

    # 2. Query ID 5 with explicit id_type=blockchain -> MUST return Crop Alpha (on-chain ID 5)
    res_chain_5 = client.get("/api/crops/5?id_type=blockchain")
    assert res_chain_5.status_code == 200
    assert res_chain_5.json()["crop_name"] == "Devgad Alphonso Mango"
    assert res_chain_5.json()["crop_id"] == 2
    assert res_chain_5.json()["blockchain_crop_id"] == 5

    res_chain_route_5 = client.get("/api/crops/chain/5")
    assert res_chain_route_5.status_code == 200
    assert res_chain_route_5.json()["crop_name"] == "Devgad Alphonso Mango"
    assert res_chain_route_5.json()["crop_id"] == 2

    # 3. Post transaction for Crop Alpha using on-chain namespace (crop_id=5, id_type="blockchain")
    tx_alpha = client.post(
        "/api/transactions",
        json={
            "crop_id": 5,
            "id_type": "blockchain",
            "event_type": "TRANSFER",
            "from_address": "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
            "to_address": "0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0",
            "to_role": "Supplier",
            "transaction_hash": "0x" + "a" * 64,
            "block_number": 10,
            "timestamp": "2026-10-29T12:00:00Z",
        },
    )
    assert tx_alpha.status_code == 201

    # 4. Post transaction for Crop Beta using database namespace (crop_id=5, id_type="db")
    tx_beta = client.post(
        "/api/transactions",
        json={
            "crop_id": 5,
            "id_type": "db",
            "event_type": "TRANSFER",
            "from_address": "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
            "to_address": "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b",
            "to_role": "Retailer",
            "transaction_hash": "0x" + "b" * 64,
            "block_number": 11,
            "timestamp": "2026-10-29T12:30:00Z",
        },
    )
    assert tx_beta.status_code == 201

    # 5. Query transactions for DB ID 5 -> MUST return ONLY Crop Beta's transaction
    tx_res_db_5 = client.get("/api/transactions/5?id_type=db")
    assert tx_res_db_5.status_code == 200
    assert len(tx_res_db_5.json()) == 1
    assert tx_res_db_5.json()[0]["transaction_hash"] == "0x" + "b" * 64

    # 6. Query transactions for on-chain ID 5 -> MUST return ONLY Crop Alpha's transaction
    tx_res_chain_5 = client.get("/api/transactions/5?id_type=blockchain")
    assert tx_res_chain_5.status_code == 200
    assert len(tx_res_chain_5.json()) == 1
    assert tx_res_chain_5.json()[0]["transaction_hash"] == "0x" + "a" * 64

    # 7. Dedicated chain route
    tx_res_chain_route_5 = client.get("/api/transactions/chain/5")
    assert tx_res_chain_route_5.status_code == 200
    assert len(tx_res_chain_route_5.json()) == 1
    assert tx_res_chain_route_5.json()[0]["transaction_hash"] == "0x" + "a" * 64


def test_batch_isolation_same_crop_name_complete_lifecycle(regression_client):
    """
    Verifies that registering, transferring, receiving, pricing, removing and tracing
    Batch 1 never affects Batch 2 sharing the exact same crop name.
    """
    client, _ = regression_client
    farmer_token = get_token(client, "farmer1")
    supplier_token = get_token(client, "supplier1")
    retailer_token = get_token(client, "retailer1")

    # Step 1: Register Batch 1
    res1 = client.post(
        "/api/crops",
        json={
            "farmer_id": "farmer1",
            "crop_name": "Devgad Alphonso Mango",
            "crop_type": "Fruit",
            "quantity": 50,
            "unit": "kg",
            "cultivation_date": "2026-06-01",
            "expected_harvest_date": "2026-10-01",
            "location": "Devgad, Maharashtra",
            "farmer_price_per_kg": 65.00,
        },
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res1.status_code == 201
    batch1 = res1.json()
    b1_id = batch1["crop_id"]

    # Step 2: Register Batch 2 with identical name
    res2 = client.post(
        "/api/crops",
        json={
            "farmer_id": "farmer1",
            "crop_name": "Devgad Alphonso Mango",
            "crop_type": "Fruit",
            "quantity": 100,
            "unit": "kg",
            "cultivation_date": "2026-06-01",
            "expected_harvest_date": "2026-10-01",
            "location": "Devgad, Maharashtra",
            "farmer_price_per_kg": 60.00,
        },
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res2.status_code == 201
    batch2 = res2.json()
    b2_id = batch2["crop_id"]

    assert b1_id != b2_id
    assert batch1["batch_number"] != batch2["batch_number"]

    # Step 3: Transfer Batch 1 from Farmer to Supplier, and then Supplier to Retailer
    tx_trans1 = client.post(
        "/api/transactions",
        json={
            "crop_id": b1_id,
            "id_type": "db",
            "event_type": "TRANSFER",
            "from_address": "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
            "to_address": "0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0",
            "to_role": "Supplier",
            "transaction_hash": "0x" + "1" * 64,
            "block_number": 101,
            "timestamp": "2026-10-29T12:00:00Z",
        },
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert tx_trans1.status_code == 201

    # Confirm supplier margin on Batch 1 only
    res_sup = client.post(
        f"/api/crops/{b1_id}/confirm-supplier-margin",
        json={"margin_per_kg": 15.00},
        headers={"Authorization": f"Bearer {supplier_token}"},
    )
    assert res_sup.status_code == 200

    # Step 4: Receive Batch 1 into retailer store inventory
    res_rx = client.post(
        f"/api/crops/{b1_id}/receive",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_rx.status_code == 200
    assert res_rx.json()["retailer_received_at"] is not None

    # Step 5: Confirm retail markup on Batch 1 only
    res_price = client.post(
        f"/api/crops/{b1_id}/confirm-retail-price",
        json={"markup_per_kg": 30.00},
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_price.status_code == 200
    assert float(res_price.json()["retail_price_per_kg"]) == 110.00

    # Step 6: Soft-remove Batch 1 (mark unavailable)
    res_unavail = client.post(
        f"/api/crops/{b1_id}/mark-unavailable",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_unavail.status_code == 200
    assert res_unavail.json()["is_available"] is False

    # VERIFY BATCH 2 IS COMPLETELY UNTOUCHED ACROSS ALL DOMAINS:
    b2_check = client.get(f"/api/crops/{b2_id}").json()
    assert b2_check["retailer_received_at"] is None, "Batch 2 retailer_received_at was altered!"
    assert b2_check["retail_price_per_kg"] is None, "Batch 2 retail_price_per_kg was altered!"
    assert b2_check["is_available"] is True, "Batch 2 is_available was altered!"
    assert float(b2_check["quantity"]) == 100.0, "Batch 2 quantity was altered!"
    assert float(b2_check["farmer_price_per_kg"]) == 60.0, "Batch 2 farmer_price_per_kg was altered!"

    # Step 7: Traceability query isolation
    txs_b1 = client.get(f"/api/transactions/{b1_id}").json()
    txs_b2 = client.get(f"/api/transactions/{b2_id}").json()
    assert len(txs_b1) >= 2, f"Batch 1 should have transaction records, got {len(txs_b1)}"
    assert len(txs_b2) == 0, f"Batch 2 must have 0 transaction records, got {len(txs_b2)}"
