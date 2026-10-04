from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_predict_price_valid_banana():
    payload = {
        "crop_type": "Banana",
        "historical_price": 4500,
        "season": "Monsoon",
        "location": "Palghar",
        "demand": 0.8,
        "production_quantity": 500,
    }
    response = client.post("/api/prediction/price", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "predicted_price" in data
    assert isinstance(data["predicted_price"], (int, float))
    assert data["predicted_price"] > 0


def test_predict_price_valid_tomato():
    payload = {
        "crop_type": "Tomato",
        "historical_price": 3200,
        "season": "Winter",
        "location": "Nashik",
        "demand": 0.88,
        "production_quantity": 350,
    }
    response = client.post("/api/prediction/price", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "predicted_price" in data
    assert data["predicted_price"] > 0


def test_predict_price_missing_fields_rejected():
    payload = {
        "crop_type": "Banana",
        "historical_price": 4500,
    }
    response = client.post("/api/prediction/price", json=payload)
    assert response.status_code == 422


def test_predict_price_invalid_numbers_rejected():
    payload = {
        "crop_type": "Banana",
        "historical_price": -500,  # Invalid negative price
        "season": "Monsoon",
        "location": "Palghar",
        "demand": 0.8,
        "production_quantity": 500,
    }
    response = client.post("/api/prediction/price", json=payload)
    assert response.status_code == 422
