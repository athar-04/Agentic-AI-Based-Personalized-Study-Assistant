"""The orchestrator must authenticate every AI route itself and ignore body-supplied user ids."""

import secrets
import time

import auth
import jwt
import pytest
from config import settings
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

# Random per run, long enough for HS256.
SECRET = secrets.token_hex(32)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(settings, "JWT_SECRET", SECRET)
    app = FastAPI()

    @app.post("/echo")
    def echo(body: dict, user_id: str = Depends(auth.require_user_id)):
        return {"userId": user_id}

    return TestClient(app)


def token(user_id="student-1", secret=SECRET, exp_offset=600):
    return jwt.encode({"userId": user_id, "exp": int(time.time()) + exp_offset}, secret, algorithm="HS256")


def test_missing_token_is_rejected(client):
    assert client.post("/echo", json={}).status_code == 401


def test_wrong_secret_is_rejected(client):
    forged = token(secret=secrets.token_hex(32))
    r = client.post("/echo", json={}, headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


def test_expired_token_is_rejected(client):
    r = client.post("/echo", json={}, headers={"Authorization": f"Bearer {token(exp_offset=-10)}"})
    assert r.status_code == 401


def test_body_user_id_cannot_override_token(client):
    r = client.post(
        "/echo",
        json={"userId": "victim-2"},
        headers={"Authorization": f"Bearer {token('student-1')}"},
    )
    assert r.status_code == 200
    assert r.json() == {"userId": "student-1"}


def test_unconfigured_secret_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "JWT_SECRET", "")
    app = FastAPI()

    @app.get("/x")
    def x(user_id: str = Depends(auth.require_user_id)):
        return {"userId": user_id}

    r = TestClient(app).get("/x", headers={"Authorization": f"Bearer {token()}"})
    assert r.status_code == 503
