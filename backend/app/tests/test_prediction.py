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
    assert data["model_name"] == "Random Forest Regressor"
    assert data["currency"] == "INR"


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


def test_get_benchmarks():
    response = client.get("/api/prediction/benchmarks/Banana")
    assert response.status_code == 200
    data = response.json()
    assert data["crop_type"] == "Banana"
    assert data["historical_price"] > 0
    assert data["demand"] > 0


def test_crop_prediction_and_acknowledgement_lifecycle():
    # Test getting prediction for Crop #1
    response = client.get("/api/prediction/crop/1")
    assert response.status_code == 200
    pred_data = response.json()
    assert "predicted_price" in pred_data
    assert pred_data["predicted_price"] > 0
    assert pred_data["currency"] == "INR"
    assert pred_data["crop_id"] == 1

    # Test consumer acknowledgement
    ack_res = client.post("/api/prediction/acknowledge/1", json={"acknowledged": True})
    assert ack_res.status_code == 200
    ack_data = ack_res.json()
    assert ack_data["crop_id"] == 1
    assert ack_data["acknowledged"] is True

    # Check acknowledgement query
    check_res = client.get("/api/prediction/acknowledge/1")
    assert check_res.status_code == 200
    assert check_res.json()["acknowledged"] is True
