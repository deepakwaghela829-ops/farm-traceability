from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import hash_password

ORIGIN = "https://frontend-tau-three-20.vercel.app"


def get_test_client():
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
        hashed_password=hash_password("Demo12345!"),
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
    client = TestClient(app)
    return client, override_get_db, test_engine


def test_cors_options_preflight():
    client, _, _ = get_test_client()
    res = client.options(
        "/api/auth/login",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == ORIGIN
    assert "POST" in res.headers.get("access-control-allow-methods", "")
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_cors_success_login_has_origin():
    client, _, _ = get_test_client()
    res = client.post(
        "/api/auth/login",
        json={"username": "farmer1", "password": "Demo12345!"},
        headers={"Origin": ORIGIN},
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == ORIGIN
    assert res.headers.get("access-control-allow-credentials") == "true"
    assert "access_token" in res.json()


def test_cors_error_401_has_origin():
    client, _, _ = get_test_client()
    res = client.post(
        "/api/auth/login",
        json={"username": "farmer1", "password": "wrongpassword"},
        headers={"Origin": ORIGIN},
    )
    assert res.status_code == 401
    assert res.headers.get("access-control-allow-origin") == ORIGIN
    assert res.headers.get("access-control-allow-credentials") == "true"
    assert res.json()["detail"] == "Incorrect username or password."


def test_cors_error_422_has_origin():
    client, _, _ = get_test_client()
    res = client.post(
        "/api/auth/login",
        json={"username": "farmer1"},  # missing password
        headers={"Origin": ORIGIN},
    )
    assert res.status_code == 422
    assert res.headers.get("access-control-allow-origin") == ORIGIN
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_cors_disallowed_origin():
    client, _, _ = get_test_client()
    res = client.post(
        "/api/auth/login",
        json={"username": "farmer1", "password": "Demo12345!"},
        headers={"Origin": "https://malicious-site.example.com"},
    )
    assert res.headers.get("access-control-allow-origin") is None
