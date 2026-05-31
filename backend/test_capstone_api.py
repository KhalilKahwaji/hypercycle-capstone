"""
End-to-end tests for the HyperCycle Capstone API.

Run the backend first:
    cd backend && uvicorn api:app --reload

Then run:
    pip install pytest requests
    pytest test_capstone_api.py -v

These tests hit a live server and use real Supabase + Groq, so program
generation / evaluation tests are slow (LLM calls). Set BASE_URL if needed.

NOTE: tests that need an admin will skip unless ADMIN_TOKEN is set. To make
a user an admin, run in Supabase SQL editor:
    update users set is_admin = true where email = 'you@example.com';
"""

import os
import time
import uuid
from io import BytesIO

import pytest
import requests

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")  # optional

# Shared state across ordered tests.
state = {}


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- health & auth ----------
def test_health():
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_register():
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_{uniq}@example.com",
        "username": f"test_{uniq}",
        "full_name": "Test Learner",
        "password": "secret123",
    }
    r = requests.post(f"{BASE_URL}/users/register", json=payload)
    assert r.status_code == 201
    data = r.json()
    state["token"] = data["access_token"]
    state["user_id"] = data["user"]["id"]
    state["email"] = payload["email"]
    state["password"] = payload["password"]


def test_login():
    r = requests.post(f"{BASE_URL}/users/login", json={
        "username_or_email": state["email"], "password": state["password"],
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_unauthorized_access_rejected():
    r = requests.get(f"{BASE_URL}/progress/me")
    assert r.status_code == 401


def test_bad_token_rejected():
    r = requests.get(f"{BASE_URL}/progress/me", headers=H("bad.token.here"))
    assert r.status_code == 401


# ---------- assessment ----------
def test_create_assessment():
    r = requests.post(f"{BASE_URL}/assessments", headers=H(state["token"]), json={
        "known_languages": "Python, JavaScript",
        "experience_level": "intermediate",
        "goals": "Build and deploy full-stack AI apps with React and FastAPI.",
        "background": "self-taught developer",
        "hours_per_week": 20,
    })
    assert r.status_code == 201


def test_get_assessment():
    r = requests.get(f"{BASE_URL}/assessments/me", headers=H(state["token"]))
    assert r.status_code == 200
    assert r.json()["assessment"]["experience_level"] == "intermediate"


# ---------- program generation (slow: LLM) ----------
@pytest.mark.slow
def test_program_generation():
    r = requests.post(f"{BASE_URL}/programs/generate", headers=H(state["token"]), timeout=120)
    assert r.status_code == 201
    days = requests.get(f"{BASE_URL}/programs/me/days", headers=H(state["token"]))
    day_list = days.json()["days"]
    assert len(day_list) == 15
    # Day 1 must be unlocked, day 2 locked.
    assert day_list[0]["is_unlocked"] is True
    assert day_list[1]["is_unlocked"] is False
    state["day1_id"] = day_list[0]["id"]
    state["day2_id"] = day_list[1]["id"]


# ---------- submission + evaluation (slow: LLM) ----------
@pytest.mark.slow
def test_submit_work_and_feedback():
    fd = {
        "program_day_id": (None, state["day1_id"]),
        "content": (None, "I completed the task fully, wrote working code, and explained my approach in detail."),
    }
    r = requests.post(f"{BASE_URL}/submissions", headers=H(state["token"]), files=fd, timeout=120)
    assert r.status_code == 201
    body = r.json()
    assert "feedback" in body
    assert 1 <= body["evaluation"]["score"] <= 10
    state["passed_day1"] = body["evaluation"]["passed"]


@pytest.mark.slow
def test_locked_day_rejected():
    # Day 2 should be locked unless day 1 passed.
    if state.get("passed_day1"):
        pytest.skip("Day 1 passed, day 2 now unlocked.")
    fd = {
        "program_day_id": (None, state["day2_id"]),
        "content": (None, "Trying to submit a locked day."),
    }
    r = requests.post(f"{BASE_URL}/submissions", headers=H(state["token"]), files=fd, timeout=60)
    assert r.status_code == 403


# ---------- file validation ----------
def test_file_too_large():
    huge = BytesIO(b"x" * (6 * 1024 * 1024))
    fd = {
        "file": ("huge.txt", huge, "text/plain"),
    }
    data = {"program_day_id": state.get("day1_id", "x"), "content": "huge file"}
    r = requests.post(f"{BASE_URL}/submissions", headers=H(state["token"]),
                      data=data, files=fd, timeout=60)
    assert r.status_code == 413


def test_bad_file_type():
    bad = BytesIO(b"binary")
    fd = {"file": ("evil.exe", bad, "application/octet-stream")}
    data = {"program_day_id": state.get("day1_id", "x"), "content": "bad file type"}
    r = requests.post(f"{BASE_URL}/submissions", headers=H(state["token"]),
                      data=data, files=fd, timeout=60)
    assert r.status_code == 400


# ---------- progress ----------
def test_progress():
    r = requests.get(f"{BASE_URL}/progress/me", headers=H(state["token"]))
    assert r.status_code == 200
    assert "percentage" in r.json()


# ---------- admin ----------
def test_admin_access_denied_for_regular_user():
    r = requests.get(f"{BASE_URL}/admin/users", headers=H(state["token"]))
    assert r.status_code == 403


@pytest.mark.skipif(not ADMIN_TOKEN, reason="ADMIN_TOKEN not set")
def test_admin_can_list_users():
    r = requests.get(f"{BASE_URL}/admin/users", headers=H(ADMIN_TOKEN))
    assert r.status_code == 200
    assert "users" in r.json()
