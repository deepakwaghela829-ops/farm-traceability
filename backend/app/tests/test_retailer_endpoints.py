import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def get_token_for(username: str) -> str:
    res = client.post(
        "/api/auth/login",
        json={"username": username, "password": "DemoPassword123!"},
    )
    if res.status_code != 200:
        # Fallback to demo default
        res = client.post(
            "/api/auth/login",
            json={"username": username, "password": "Demo12345!"},
        )
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return res.json()["access_token"]


def create_sample_crop(farmer_token: str) -> int:
    crop_payload = {
        "crop_name": "Test Retailer Crop",
        "crop_type": "Tomato",
        "quantity": 100.0,
        "unit": "kg",
        "cultivation_date": "2026-06-01",
        "expected_harvest_date": "2026-09-01",
        "location": "Nashik, Maharashtra",
        "farmer_id": "farmer1",
        "farmer_price_per_kg": 25.00,
    }
    res = client.post(
        "/api/crops",
        json=crop_payload,
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res.status_code == 201, f"Crop creation failed: {res.text}"
    return res.json()["crop_id"]


def test_retailer_receive_endpoint():
    farmer_token = get_token_for("farmer1")
    retailer_token = get_token_for("retailer1")

    crop_id = create_sample_crop(farmer_token)

    # 1. Non-retailer cannot call receive
    res_forbidden = client.post(
        f"/api/crops/{crop_id}/receive",
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res_forbidden.status_code == 403

    # 2. Retailer successfully receives crop
    res_rx = client.post(
        f"/api/crops/{crop_id}/receive",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_rx.status_code == 200
    data = res_rx.json()
    assert data["retailer_received_at"] is not None
    assert data["retailer_received_by"] == "retailer1"
    assert data["is_available"] is True

    # 3. Repeat receive is idempotent and safe
    res_repeat = client.post(
        f"/api/crops/{crop_id}/receive",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_repeat.status_code == 200

    # 4. Transactions table contains RECEIVE event
    res_tx = client.get(f"/api/transactions/{crop_id}")
    assert res_tx.status_code == 200
    txs = res_tx.json()
    rx_txs = [t for t in txs if t["event_type"] == "RECEIVE"]
    assert len(rx_txs) >= 1


def test_retailer_mark_unavailable_and_available():
    farmer_token = get_token_for("farmer1")
    retailer_token = get_token_for("retailer1")

    crop_id = create_sample_crop(farmer_token)

    # Receive first
    client.post(
        f"/api/crops/{crop_id}/receive",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )

    # 1. Non-retailer cannot mark unavailable
    res_forbidden = client.post(
        f"/api/crops/{crop_id}/mark-unavailable",
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res_forbidden.status_code == 403

    # 2. Retailer marks unavailable (soft remove from inventory)
    res_unavail = client.post(
        f"/api/crops/{crop_id}/mark-unavailable",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_unavail.status_code == 200
    assert res_unavail.json()["is_available"] is False

    # 3. Active inventory list excludes unavailable crop when available_only=true
    res_avail_list = client.get("/api/crops?available_only=true")
    assert res_avail_list.status_code == 200
    avail_ids = [c["crop_id"] for c in res_avail_list.json()]
    assert crop_id not in avail_ids

    # 4. Crop is still accessible by ID and traceability is preserved
    res_crop = client.get(f"/api/crops/{crop_id}")
    assert res_crop.status_code == 200
    assert res_crop.json()["crop_id"] == crop_id
    assert res_crop.json()["is_available"] is False

    # 5. Retailer restores availability
    res_restore = client.post(
        f"/api/crops/{crop_id}/mark-available",
        headers={"Authorization": f"Bearer {retailer_token}"},
    )
    assert res_restore.status_code == 200
    assert res_restore.json()["is_available"] is True

    # 6. Now present in available_only list
    res_avail_again = client.get("/api/crops?available_only=true")
    avail_ids_again = [c["crop_id"] for c in res_avail_again.json()]
    assert crop_id in avail_ids_again
