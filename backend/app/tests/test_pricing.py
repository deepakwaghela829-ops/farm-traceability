from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import create_access_token

client = TestClient(app)

farmer_token = create_access_token({"sub": "farmer1", "role": "FARMER", "id": 1})
farmer2_token = create_access_token({"sub": "farmer2", "role": "FARMER", "id": 99})
supplier_token = create_access_token({"sub": "supplier1", "role": "SUPPLIER", "id": 2})
retailer_token = create_access_token({"sub": "retailer1", "role": "RETAILER", "id": 3})
consumer_token = create_access_token({"sub": "consumer1", "role": "CONSUMER", "id": 4})


def test_ai_price_prediction_units_and_metrics():
    payload = {
        "crop_type": "Banana",
        "historical_price": 4500,  # Quintal benchmark
        "season": "Monsoon",
        "location": "Palghar",
        "demand": 0.8,
        "production_quantity": 500,
    }
    response = client.post("/api/prediction/price", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["unit"] == "kg"
    assert data["currency"] == "INR"
    assert data["is_indicative"] is True
    # Verify price is converted to per kg (not ₹4500/kg)
    assert 20.0 <= data["predicted_price"] <= 100.0
    assert data["predicted_price_per_kg"] == data["predicted_price"]
    assert data["predicted_price_per_quintal"] >= 2000.0

    # Verify evaluation metrics
    metrics = data["evaluation_metrics"]
    assert metrics is not None
    assert "mae_per_kg" in metrics
    assert "rmse_per_kg" in metrics
    assert "r2" in metrics


def test_create_crop_with_farmer_price():
    payload = {
        "farmer_id": "farmer1",
        "crop_name": "Premium Mango Baneshan",
        "crop_type": "Mango",
        "quantity": 300,
        "unit": "kg",
        "cultivation_date": "2026-03-01",
        "expected_harvest_date": "2026-06-01",
        "location": "Ratnagiri, Maharashtra",
        "farmer_price_per_kg": 65.00,
    }
    headers = {"Authorization": f"Bearer {farmer_token}"}
    response = client.post("/api/crops", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert float(data["farmer_price_per_kg"]) == 65.00
    assert data["retail_price_per_kg"] is None
    assert data["retail_confirmed_by"] is None


def test_farmer_price_validation():
    base = {
        "farmer_id": "farmer1",
        "crop_name": "Test Crop",
        "crop_type": "Tomato",
        "quantity": 100,
        "unit": "kg",
        "cultivation_date": "2026-03-01",
        "expected_harvest_date": "2026-06-01",
        "location": "Nashik",
    }
    headers = {"Authorization": f"Bearer {farmer_token}"}

    # Reject negative price
    res_neg = client.post("/api/crops", json={**base, "farmer_price_per_kg": -10.00}, headers=headers)
    assert res_neg.status_code == 422

    # Reject zero price
    res_zero = client.post("/api/crops", json={**base, "farmer_price_per_kg": 0.00}, headers=headers)
    assert res_zero.status_code == 422

    # Reject unrealistic micro-price (< 1.00)
    res_micro = client.post("/api/crops", json={**base, "farmer_price_per_kg": 0.50}, headers=headers)
    assert res_micro.status_code == 422


def test_confirm_retail_price_workflow():
    # 1. Farmer registers crop with farm-gate price = 50.00
    create_payload = {
        "farmer_id": "farmer1",
        "crop_name": "Alphonso Export Grade",
        "crop_type": "Mango",
        "quantity": 250,
        "unit": "kg",
        "cultivation_date": "2026-02-15",
        "expected_harvest_date": "2026-05-15",
        "location": "Devgad",
        "farmer_price_per_kg": 50.00,
    }
    res_create = client.post("/api/crops", json=create_payload)
    assert res_create.status_code == 201
    crop_id = res_create.json()["crop_id"]

    retailer_headers = {"Authorization": f"Bearer {retailer_token}"}

    # 2. Retailer attempts to confirm BEFORE receipt into inventory -> MUST FAIL
    res_premature = client.post(
        f"/api/crops/{crop_id}/confirm-retail-price",
        headers=retailer_headers,
        json={"markup_per_kg": 30.00},
    )
    assert res_premature.status_code == 400
    assert "received into retailer inventory" in res_premature.json()["detail"].lower()

    # 3. Record RECEIVE event in inventory (Retailer receives crop)
    receive_payload = {
        "crop_id": crop_id,
        "event_type": "RECEIVE",
        "from_address": "0x1111111111111111111111111111111111111111",
        "to_address": "0x2222222222222222222222222222222222222222",
        "to_role": "Retailer",
        "transaction_hash": "0x" + "a" * 64,
        "block_number": 10,
        "timestamp": "2026-05-16T10:00:00Z",
    }
    res_tx = client.post("/api/transactions", json=receive_payload)
    assert res_tx.status_code == 201

    # 4. Now Retailer confirms retail price -> SUCCESS
    # Retail price = Farmer price (50.00) + Fixed markup (30.00) = 80.00
    res_confirm = client.post(
        f"/api/crops/{crop_id}/confirm-retail-price",
        headers=retailer_headers,
        json={"markup_per_kg": 30.00},
    )
    assert res_confirm.status_code == 200
    confirmed_crop = res_confirm.json()
    assert float(confirmed_crop["farmer_price_per_kg"]) == 50.00
    assert float(confirmed_crop["retailer_markup_per_kg"]) == 30.00
    assert float(confirmed_crop["retail_price_per_kg"]) == 80.00
    assert confirmed_crop["retail_confirmed_by"] == "retailer1"
    assert confirmed_crop["retail_confirmed_at"] is not None


def test_retailer_cannot_bypass_markup():
    # Attempting to send custom markup != 30.00 must be rejected
    res = client.post(
        "/api/crops/1/confirm-retail-price",
        headers={"Authorization": f"Bearer {retailer_token}"},
        json={"markup_per_kg": 50.00},
    )
    # Pydantic validator will reject 50.00 with 422
    assert res.status_code in (400, 422)


def test_unauthorized_user_cannot_confirm_retail_price():
    # Consumer cannot confirm price
    res_consumer = client.post(
        "/api/crops/1/confirm-retail-price",
        headers={"Authorization": f"Bearer {consumer_token}"},
        json={"markup_per_kg": 30.00},
    )
    assert res_consumer.status_code == 403

    # Unauthenticated cannot confirm price
    res_no_auth = client.post(
        "/api/crops/1/confirm-retail-price",
        json={"markup_per_kg": 30.00},
    )
    assert res_no_auth.status_code == 401


def test_update_farmer_price():
    # Create crop
    res = client.post(
        "/api/crops",
        json={
            "farmer_id": "farmer1",
            "crop_name": "Shimla Apples",
            "crop_type": "Apple",
            "quantity": 150,
            "unit": "kg",
            "cultivation_date": "2026-01-01",
            "expected_harvest_date": "2026-04-01",
            "location": "Shimla",
            "farmer_price_per_kg": 80.00,
        },
    )
    crop_id = res.json()["crop_id"]

    # Unauthorized role (supplier) cannot update farmer price -> 403
    res_forbidden = client.patch(
        f"/api/crops/{crop_id}/farmer-price",
        headers={"Authorization": f"Bearer {supplier_token}"},
        json={"farmer_price_per_kg": 90.00},
    )
    assert res_forbidden.status_code == 403

    # Original farmer can update price
    res_update = client.patch(
        f"/api/crops/{crop_id}/farmer-price",
        headers={"Authorization": f"Bearer {farmer_token}"},
        json={"farmer_price_per_kg": 95.00},
    )
    assert res_update.status_code == 200
    assert float(res_update.json()["farmer_price_per_kg"]) == 95.00
