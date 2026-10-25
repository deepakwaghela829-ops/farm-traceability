from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint_includes_database_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "database" in data
    assert "primary" in data["database"]
    assert "storage_mode" in data["database"]
    assert data["database"]["storage_mode"] in ("persistent", "ephemeral_fallback", "persistent_local")


def test_blockchain_status_endpoint():
    res = client.get("/api/blockchain/status")
    assert res.status_code == 200
    data = res.json()
    assert "online" in data
    assert "expected_chain_id" in data
    assert data["expected_chain_id"] == 1337
    assert "contract_address" in data


def test_blockchain_rpc_proxy_handles_requests():
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_blockNumber",
        "params": [],
        "id": 42,
    }
    res = client.post("/api/blockchain/rpc", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data.get("id") == 42
    # Returns either result (if local Ganache running) or structured JSON-RPC error (if offline)
    assert ("result" in data) or ("error" in data)
