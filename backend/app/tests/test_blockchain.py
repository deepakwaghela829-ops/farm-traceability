import os
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import app

client = TestClient(app)


def get_auth_token(username: str = "farmer1") -> str:
    """Helper to log in and get JWT token for tests."""
    res = client.post("/api/auth/login", json={"username": username, "password": "Demo12345!"})
    assert res.status_code == 200
    return res.json()["access_token"]


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


# 1. Test unauthorized RPC requests
def test_unauthorized_rpc_requests_rejected():
    payload = {"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}
    # No auth header
    res = client.post("/api/blockchain/rpc", json=payload)
    assert res.status_code == 401
    assert "detail" in res.json()

    # Invalid token
    res = client.post(
        "/api/blockchain/rpc",
        json=payload,
        headers={"Authorization": "Bearer invalid_token_xyz_123"},
    )
    assert res.status_code == 401


# 2. Test forbidden RPC methods (administrative, debug, personal)
@pytest.mark.parametrize(
    "forbidden_method",
    [
        "evm_mine",
        "evm_increaseTime",
        "ganache_snapshot",
        "personal_unlockAccount",
        "personal_importRawKey",
        "admin_peers",
        "debug_traceTransaction",
        "miner_start",
        "unknown_arbitrary_method",
    ],
)
def test_forbidden_rpc_methods_rejected(forbidden_method):
    token = get_auth_token("farmer1")
    payload = {"jsonrpc": "2.0", "method": forbidden_method, "params": [], "id": 1}
    res = client.post(
        "/api/blockchain/rpc",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert "forbidden" in res.json()["detail"].lower() or "not permitted" in res.json()["detail"].lower()


# 3. Test account impersonation prevention
def test_account_impersonation_prevention():
    farmer_token = get_auth_token("farmer1")
    # Attempting to send transaction claiming to be supplier1's wallet
    impersonated_payload = {
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [
            {
                "from": "0xf17f52151EbEF6C7334FAD080c5704D77216b732",  # supplier1 wallet
                "to": "0xb524d5e1329F405f004720C5FcD4F023916c64F3",
                "data": "0x12345678",
            }
        ],
        "id": 10,
    }
    res = client.post(
        "/api/blockchain/rpc",
        json=impersonated_payload,
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res.status_code == 403
    assert "impersonation" in res.json()["detail"].lower()


def test_rpc_transaction_missing_from_rejected():
    farmer_token = get_auth_token("farmer1")
    missing_from_payload = {
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [{"to": "0xb524d5e1329F405f004720C5FcD4F023916c64F3"}],
        "id": 11,
    }
    res = client.post(
        "/api/blockchain/rpc",
        json=missing_from_payload,
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    assert res.status_code == 400


# 4. Test role unauthorized transaction initiation
def test_role_unauthorized_transactions_rejected():
    # Consumer is read-only and not allowed to initiate on-chain transactions
    consumer_token = get_auth_token("consumer1")
    tx_payload = {
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [
            {
                "from": "0x821aEa9a577a9b44299B9c15c88cf3087F3b5544",  # consumer1 wallet
                "to": "0xb524d5e1329F405f004720C5FcD4F023916c64F3",
                "data": "0x1234",
            }
        ],
        "id": 12,
    }
    res = client.post(
        "/api/blockchain/rpc",
        json=tx_payload,
        headers={"Authorization": f"Bearer {consumer_token}"},
    )
    assert res.status_code == 403
    assert "not authorized" in res.json()["detail"].lower()


# 5. Test authorized RPC operations
def test_authorized_rpc_read_operation():
    token = get_auth_token("farmer1")
    read_payload = {
        "jsonrpc": "2.0",
        "method": "eth_blockNumber",
        "params": [],
        "id": 20,
    }
    res = client.post(
        "/api/blockchain/rpc",
        json=read_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data.get("id") == 20
    assert ("result" in data) or ("error" in data)


def test_authorized_rpc_write_operation_passes_validation():
    farmer_token = get_auth_token("farmer1")
    # Farmer wallet matches farmer1 profile exactly
    valid_tx_payload = {
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [
            {
                "from": "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",  # farmer1 wallet
                "to": "0xb524d5e1329F405f004720C5FcD4F023916c64F3",
                "data": "0x",
            }
        ],
        "id": 21,
    }
    res = client.post(
        "/api/blockchain/rpc",
        json=valid_tx_payload,
        headers={"Authorization": f"Bearer {farmer_token}"},
    )
    # Passes authorization check (status 200 returned with relayed result or relay offline notice)
    assert res.status_code == 200
    data = res.json()
    assert data.get("id") == 21


# 6. Test production missing or weak JWT secret fails safely
def test_production_missing_jwt_secret_fails(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "")
    with pytest.raises(RuntimeError, match="Critical Security Error"):
        Settings()


def test_production_insecure_default_jwt_secret_fails(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "agritrace_jwt_secret_key_2026_super_secure")
    with pytest.raises(RuntimeError, match="Critical Security Error"):
        Settings()


def test_production_short_jwt_secret_fails(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "short_secret_under_32_chars")
    with pytest.raises(RuntimeError, match="Critical Security Error"):
        Settings()


def test_production_strong_jwt_secret_succeeds(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    strong_secret = "a" * 32 + "_valid_strong_production_secret"
    monkeypatch.setenv("JWT_SECRET", strong_secret)
    s = Settings()
    assert s.jwt_secret == strong_secret
