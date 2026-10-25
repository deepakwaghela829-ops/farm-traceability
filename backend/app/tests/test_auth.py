import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import hash_password


@pytest.fixture
def auth_client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=test_engine)

    db = TestingSessionLocal()
    u = User(
        username="farmer1",
        email="farmer@agritrace.org",
        hashed_password=hash_password("farmer123"),
        role="FARMER",
        wallet_address="0x7c77bd71b46889f6345c2a662756702dc620821c",
        full_name="Ramesh Patel",
    )
    db.add(u)
    db.commit()
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def test_auth_login_and_me(auth_client):
    res = auth_client.post("/api/auth/login", json={"username": "farmer1", "password": "farmer123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "FARMER"
    assert data["user"]["username"] == "farmer1"

    token = data["access_token"]
    res_me = auth_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert res_me.json()["username"] == "farmer1"


def test_auth_invalid_credentials(auth_client):
    res = auth_client.post("/api/auth/login", json={"username": "farmer1", "password": "wrong"})
    assert res.status_code == 401


def test_auth_register_new_user(auth_client):
    res = auth_client.post(
        "/api/auth/register",
        json={
            "username": "supplier_new",
            "email": "supplier_new@test.com",
            "password": "secretpassword",
            "role": "SUPPLIER",
            "full_name": "Supplier User",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["role"] == "SUPPLIER"
    assert "access_token" in data


def test_auth_missing_and_invalid_token(auth_client):
    # No header
    res_none = auth_client.get("/api/auth/me")
    assert res_none.status_code == 401

    # Malformed header
    res_bad = auth_client.get("/api/auth/me", headers={"Authorization": "NotBearer invalidtoken"})
    assert res_bad.status_code == 401

    # Fake token
    res_fake = auth_client.get("/api/auth/me", headers={"Authorization": "Bearer fake.jwt.token"})
    assert res_fake.status_code == 401


def test_auth_role_authorization_admin_protection(auth_client):
    # Non-admin user (farmer1) attempts to access /api/auth/users
    login_res = auth_client.post("/api/auth/login", json={"username": "farmer1", "password": "farmer123"})
    token = login_res.json()["access_token"]

    admin_res = auth_client.get("/api/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert admin_res.status_code == 403


def test_sync_demo_accounts_endpoint_unauthorized(auth_client):
    # No auth header -> 401
    res = auth_client.post("/api/auth/sync-demo-accounts")
    assert res.status_code == 401
    assert "detail" in res.json()

    # Wrong token -> 401
    res_wrong = auth_client.post("/api/auth/sync-demo-accounts", headers={"X-Sync-Token": "invalid_wrong_token"})
    assert res_wrong.status_code == 401


def test_sync_demo_accounts_endpoint_authorized(auth_client, monkeypatch):
    import os
    monkeypatch.setenv("SYNC_DEMO_TOKEN", "secure_test_sync_token_32chars_long")

    # Call with correct token
    res = auth_client.post(
        "/api/auth/sync-demo-accounts",
        headers={"X-Sync-Token": "secure_test_sync_token_32chars_long"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "synchronized" in data
    assert "farmer1" in data["synchronized"]["updated"] or "farmer1" in data["synchronized"]["verified"]

    # Verify all 5 demo accounts can now log in with Demo12345!
    for username in ["farmer1", "supplier1", "retailer1", "consumer1", "admin1"]:
        login_res = auth_client.post("/api/auth/login", json={"username": username, "password": "Demo12345!"})
        assert login_res.status_code == 200, f"Login failed for {username}"
        assert login_res.json()["user"]["username"] == username


def test_sync_designated_demo_users_leaves_other_users_intact(auth_client):
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.seed_demo_users import sync_designated_demo_users

    # Create a custom non-demo user
    res = auth_client.post(
        "/api/auth/register",
        json={
            "username": "custom_farmer",
            "email": "custom@farm.org",
            "password": "MySecretCustomPassword123!",
            "role": "FARMER",
        },
    )
    assert res.status_code == 201

    # Sync designated demo accounts
    from app.config import get_settings
    res_sync = auth_client.post(
        "/api/auth/sync-demo-accounts",
        headers={"X-Sync-Token": get_settings().jwt_secret},
    )
    assert res_sync.status_code == 200

    # Verify custom non-demo user was NOT modified and can still log in with original password
    login_custom = auth_client.post(
        "/api/auth/login",
        json={"username": "custom_farmer", "password": "MySecretCustomPassword123!"},
    )
    assert login_custom.status_code == 200
    assert login_custom.json()["user"]["username"] == "custom_farmer"

