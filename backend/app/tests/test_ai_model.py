import pytest
from fastapi.testclient import TestClient

from app.ai.predictor import get_market_benchmarks, get_model, predict_price, predict_price_breakdown
from app.main import app

client = TestClient(app)


def test_ai_model_loading_and_singleton():
    model = get_model()
    assert model is not None
    # Verify singleton
    model2 = get_model()
    assert model is model2


def test_market_benchmarks_resolution():
    benchmarks = get_market_benchmarks()
    assert len(benchmarks) > 0
    assert "banana" in benchmarks or "tomato" in benchmarks
    assert "__default__" in benchmarks

    # Check benchmark endpoint
    res = client.get("/api/prediction/benchmarks/Tomato")
    assert res.status_code == 200
    data = res.json()
    assert "historical_price" in data
    assert data["historical_price"] > 0
    assert "demand" in data


def test_price_prediction_inference_bounds():
    crops_to_test = ["Banana", "Tomato", "Onion", "Potato", "Mango", "Cabbage", "Cauliflower", "Grapes"]

    for crop in crops_to_test:
        price_kg = predict_price(
            crop_type=crop,
            historical_price=3500.0,
            season="Monsoon",
            location="Nashik",
            demand=0.8,
            production_quantity=500.0,
            output_unit="kg",
        )
        assert price_kg > 0, f"Predicted price for {crop} should be positive"
        assert 5.0 <= price_kg <= 250.0, f"Predicted price for {crop} ({price_kg}) out of expected agricultural bounds"


def test_price_prediction_api_endpoint():
    payload = {
        "crop_type": "Tomato",
        "historical_price": 3200.0,
        "season": "Monsoon",
        "location": "Nashik",
        "demand": 0.85,
        "production_quantity": 400.0,
    }
    res = client.post("/api/prediction/price", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["predicted_price"] > 0
    assert data["predicted_price_per_kg"] == data["predicted_price"]
    assert data["predicted_price_per_quintal"] > data["predicted_price_per_kg"]
    assert data["model_name"] == "Random Forest Regressor"
    assert data["evaluation_metrics"]["r2"] >= 0.95


def test_adopt_farmer_price_workflow():
    # Login as farmer
    login_res = client.post("/api/auth/login", json={"username": "farmer1", "password": "DemoPassword123!"})
    if login_res.status_code != 200:
        login_res = client.post("/api/auth/login", json={"username": "farmer1", "password": "Demo12345!"})
    token = login_res.json()["access_token"]

    # Create crop
    crop_res = client.post(
        "/api/crops",
        json={
            "crop_name": "AI Adopt Price Crop",
            "crop_type": "Tomato",
            "quantity": 250.0,
            "unit": "kg",
            "cultivation_date": "2026-06-01",
            "expected_harvest_date": "2026-09-01",
            "location": "Pune, Maharashtra",
            "farmer_id": "farmer1",
            "farmer_price_per_kg": 20.00,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    crop_id = crop_res.json()["crop_id"]

    # Predict price
    pred_res = client.post(
        "/api/prediction/price",
        json={
            "crop_id": crop_id,
            "crop_type": "Tomato",
            "historical_price": 3500.0,
            "season": "Monsoon",
            "location": "Pune",
            "demand": 0.9,
            "production_quantity": 250.0,
        },
    )
    predicted_val = pred_res.json()["predicted_price"]

    # Adopt price via PATCH
    patch_res = client.patch(
        f"/api/crops/{crop_id}/farmer-price",
        json={"farmer_price_per_kg": predicted_val},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_res.status_code == 200
    assert float(patch_res.json()["farmer_price_per_kg"]) == pytest.approx(predicted_val, 0.01)
