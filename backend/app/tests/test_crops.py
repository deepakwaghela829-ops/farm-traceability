import pytest
from datetime import date
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


def test_create_crop(client):
    response = client.post(
        "/api/crops",
        json={
            "farmer_id": "DEMO-FARMER-001",
            "crop_name": "Banana",
            "crop_type": "Fruit",
            "quantity": 1200,
            "unit": "kg",
            "cultivation_date": "2026-08-01",
            "expected_harvest_date": "2027-01-15",
            "location": "Palghar, Maharashtra",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["crop_name"] == "Banana"
    assert data["farmer_id"] == "DEMO-FARMER-001"
    assert data["crop_id"] == 1


def test_list_crops_for_farmer(client):
    payload = {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Lemon",
        "crop_type": "Fruit",
        "quantity": 350,
        "unit": "kg",
        "cultivation_date": "2026-08-10",
        "expected_harvest_date": "2027-02-10",
        "location": "Palghar, Maharashtra",
    }
    client.post("/api/crops", json=payload)

    response = client.get("/api/crops", params={"farmer_id": "DEMO-FARMER-001"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["crop_name"] == "Lemon"


def test_invalid_quantity_is_rejected(client):
    payload = {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Banana",
        "crop_type": "Fruit",
        "quantity": 0,
        "unit": "kg",
        "cultivation_date": "2026-08-01",
        "expected_harvest_date": "2027-01-15",
        "location": "Palghar, Maharashtra",
    }
    response = client.post("/api/crops", json=payload)
    assert response.status_code == 422


def test_harvest_date_before_cultivation_date_is_rejected(client):
    payload = {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Banana",
        "crop_type": "Fruit",
        "quantity": 100,
        "unit": "kg",
        "cultivation_date": "2026-09-01",
        "expected_harvest_date": "2026-08-01",
        "location": "Palghar, Maharashtra",
    }
    response = client.post("/api/crops", json=payload)
    assert response.status_code == 422


def test_get_crop_by_db_id_and_blockchain_id(client):
    # Test case where Database ID != Blockchain ID (DB ID = 1, Blockchain ID = 42)
    payload = {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Alphonso Mango",
        "crop_type": "Fruit",
        "quantity": 500,
        "unit": "kg",
        "cultivation_date": "2026-08-01",
        "expected_harvest_date": "2027-01-15",
        "location": "Ratnagiri, Maharashtra",
        "blockchain_crop_id": 42,
        "blockchain_tx_hash": "0x" + "a" * 64,
        "blockchain_block_number": 5,
        "blockchain_farmer_address": "0xa5c5A997d004B8D3294E48b8494996B703E9513E",
        "blockchain_chain_id": 1337,
    }
    create_resp = client.post("/api/crops", json=payload)
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    assert created_data["crop_id"] == 1
    assert created_data["blockchain_crop_id"] == 42

    # Lookup by Database ID (1)
    by_db_resp = client.get("/api/crops/1")
    assert by_db_resp.status_code == 200
    assert by_db_resp.json()["crop_name"] == "Alphonso Mango"
    assert by_db_resp.json()["blockchain_crop_id"] == 42

    # Lookup by Blockchain ID (42)
    by_chain_resp = client.get("/api/crops/42")
    assert by_chain_resp.status_code == 200
    assert by_chain_resp.json()["crop_name"] == "Alphonso Mango"
    assert by_chain_resp.json()["crop_id"] == 1


def test_crop_with_missing_blockchain_metadata(client):
    payload = {
        "farmer_id": "DEMO-FARMER-002",
        "crop_name": "Tomato",
        "crop_type": "Vegetable",
        "quantity": 250,
        "unit": "kg",
        "cultivation_date": "2026-08-01",
        "expected_harvest_date": "2026-11-15",
        "location": "Nashik, Maharashtra",
    }
    create_resp = client.post("/api/crops", json=payload)
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["blockchain_crop_id"] is None
    assert data["blockchain_tx_hash"] is None

    # Retrieve by database ID
    get_resp = client.get(f"/api/crops/{data['crop_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["blockchain_crop_id"] is None


def test_crop_not_found(client):
    response = client.get("/api/crops/999")
    assert response.status_code == 404

