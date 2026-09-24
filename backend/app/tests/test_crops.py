import os
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app

engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_create_crop():
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


def test_list_crops_for_farmer():
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


def test_invalid_quantity_is_rejected():
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


def test_harvest_date_before_cultivation_date_is_rejected():
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
