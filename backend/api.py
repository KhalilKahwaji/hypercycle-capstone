import os
import time
import json
import logging
import re
from pathlib import Path
from uuid import uuid4
from typing import Optional
from datetime import datetime, timedelta, timezone
from collections import defaultdict

import bcrypt
import bleach
from dotenv import load_dotenv
from jose import jwt, JWTError
from fastapi import (
    FastAPI, HTTPException, UploadFile, File, Form, status, Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from supabase import create_client, Client
from openai import OpenAI as _GroqFactory

# Load .env from the backend folder (or root if you keep it there)
load_dotenv(Path(__file__).resolve().parent / ".env")

import file_processor
import program_generator
import evaluator
import achievements
import platform_knowledge

# -----------------------------
# Config
# -----------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-this-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24

MAX_REQUESTS_PER_MINUTE = 100
RATE_LIMIT_WINDOW_SECONDS = 60
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

ENABLE_SIMULATE = os.getenv("ENABLE_SIMULATE", "false").lower() == "true"

PUBLIC_PATHS = {
    "/", "/health", "/users/register", "/users/login",
    "/docs", "/openapi.json", "/redoc",
}
START_TIME = time.time()

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

_GROQ_API_KEY = os.getenv("GROQ_API_KEY")
_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_groq_client = _GroqFactory(api_key=_GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")

# -----------------------------
# Logging
# -----------------------------
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("ai_buddy_api")


def log_json(data: dict):
    logger.info(json.dumps(data, default=str))


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="AI Buddy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

request_timestamps_by_user = defaultdict(list)

# -----------------------------
# Models
# -----------------------------
class RegisterUserRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3)
    full_name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)


class AssessmentRequest(BaseModel):
    known_languages: str = Field(default="", max_length=2000)
    experience_level: str = Field(..., min_length=1)
    goals: str = Field(..., min_length=1, max_length=4000)
    background: str = Field(default="", max_length=2000)
    hours_per_week: int = Field(..., ge=1, le=80)
    age: int = Field(..., ge=10, le=100)


class AdminPassDayRequest(BaseModel):
    score: int = Field(default=7, ge=1, le=10)
    summary: str = Field(..., min_length=1)


class CliCheckRequest(BaseModel):
    project_text: str = Field(..., min_length=1)
    dry_run: bool = True


class SimulateTaskInput(BaseModel):
    title: str = Field(..., min_length=1)
    objective: str = Field(default="")
    task_description: str = Field(..., min_length=1)
    expected_output: str = Field(default="")
    evaluation_criteria: str = Field(default="")
    day_number: int = Field(default=1)
    research_topics: str = Field(default="")
    estimated_hours: float = Field(default=5.0)
    unlock_condition: str = Field(default="")


class SimulateEvaluateRequest(BaseModel):
    task: SimulateTaskInput
    submission_text: str = Field(..., min_length=1)
    file_analysis: Optional[dict] = None


class SimulateSubmitRequest(BaseModel):
    """
    Mirrors the real /submissions flow: evaluate the day, then adapt the next
    day based on performance. No database reads or writes.
    """
    program_title: str = Field(default="")
    program_summary: str = Field(default="")
    username: str = Field(default="learner")
    day: SimulateTaskInput                        # current day (e.g. Day 1)
    next_day_draft: Optional[SimulateTaskInput] = None  # Day 2 pre-adaptation
    submission_text: str = Field(..., min_length=1)
    file_analysis: Optional[dict] = None


class CliAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


# -----------------------------
# Helpers
# -----------------------------
def sanitize_text(value: str) -> str:
    cleaned = bleach.clean(value or "", tags=[], attributes={}, strip=True)
    return cleaned.strip()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])


def get_token_from_header(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


def is_public_path(path: str) -> bool:
    if path in PUBLIC_PATHS or path.startswith("/docs"):
        return True
    if ENABLE_SIMULATE and path.startswith("/simulate"):
        return True
    return False


def check_rate_limit(user_id: str):
    now = time.time()
    timestamps = [
        ts for ts in request_timestamps_by_user[user_id]
        if now - ts < RATE_LIMIT_WINDOW_SECONDS
    ]
    request_timestamps_by_user[user_id] = timestamps
    if len(timestamps) >= MAX_REQUESTS_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait and try again.",
        )
    timestamps.append(now)


def find_user_by_email(email: str):
    email = (email or "").lower()
    r = safe_execute(supabase.table("users").select("*").eq("email", email))
    return r.data[0] if r.data else None


def find_user_by_id(user_id: str):
    r = safe_execute(supabase.table("users").select("*").eq("id", user_id))
    return r.data[0] if r.data else None


def find_user_by_username_or_email(value: str):
    value = sanitize_text(value)
    r = safe_execute(
        supabase.table("users").select("*")
        .or_(f"username.eq.{value},email.ilike.{value}")
    )
    return r.data[0] if r.data else None


def remove_password_hash(user: dict) -> dict:
    safe = dict(user)
    safe.pop("password_hash", None)
    return safe


def require_admin(user_id: str) -> dict:
    user = find_user_by_id(user_id)
    if not user or not user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


def upload_submission_file(user_id: str, filename: str, file_bytes: bytes, content_type: str):
    safe_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename or "uploaded_file")
    storage_path = f"{user_id}/{uuid4()}-{safe_filename}"
    supabase.storage.from_("submissions").upload(
        path=storage_path,
        file=file_bytes,
        file_options={
            "content-type": content_type or "application/octet-stream",
            "upsert": "true",
        },
    )
    return supabase.storage.from_("submissions").get_public_url(storage_path)


def safe_execute(query, retries=3):
    last_err = None
    for _ in range(retries):
        try:
            return query.execute()
        except Exception as e:
            last_err = e
    raise last_err


def bulk_compute_progress(users: list) -> dict:
    """Returns {user_id: progress_dict} for a list of user dicts."""
    if not users:
        return {}
    user_ids = [u["id"] for u in users]
    programs = safe_execute(
        supabase.table("programs").select("id,user_id,total_days").in_("user_id", user_ids)
    ).data
    prog_by_user = {p["user_id"]: p for p in programs}
    prog_ids = [p["id"] for p in programs]

    days = []
    if prog_ids:
        days = safe_execute(
            supabase.table("program_days").select("program_id,is_completed").in_("program_id", prog_ids)
        ).data

    completed_by_prog: dict = {}
    for d in days:
        if d["is_completed"]:
            completed_by_prog[d["program_id"]] = completed_by_prog.get(d["program_id"], 0) + 1

    result: dict = {}
    for uid in user_ids:
        prog = prog_by_user.get(uid)
        if not prog:
            result[uid] = {"completed_days": 0, "total_days": 16, "percentage": 0, "has_program": False}
        else:
            total = prog["total_days"]
            completed = completed_by_prog.get(prog["id"], 0)
            pct = round((completed / total) * 100) if total else 0
            result[uid] = {"completed_days": completed, "total_days": total,
                           "percentage": pct, "has_program": True}
    return result


# -----------------------------
# Middleware (Day 9 — auth + logging + rate limit)
# -----------------------------
@app.middleware("http")
async def auth_logging_rate_limit_middleware(request: Request, call_next):
    start_time = time.time()
    user_id = None
    status_code = 500
    try:
         # Let CORS preflight requests through untouched.
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        if not is_public_path(path):
            token = get_token_from_header(request)
            if not token:
                return JSONResponse(status_code=401, content={"detail": "Authentication required."})
            try:
                payload = decode_access_token(token)
                user_id = payload.get("sub")
                if not user_id:
                    return JSONResponse(status_code=401, content={"detail": "Invalid authentication token."})
                request.state.user_id = user_id
                check_rate_limit(user_id)
            except JWTError:
                return JSONResponse(status_code=401, content={"detail": "Invalid or expired authentication token."})

        response = await call_next(request)
        status_code = response.status_code
        return response
    except HTTPException as e:
        status_code = e.status_code
        return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
    except Exception as e:
        status_code = 500
        log_json({"event": "unhandled_error", "method": request.method,
                  "path": request.url.path, "user_id": user_id, "error": repr(e)})
        return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again later."})
    finally:
        log_json({
            "event": "request", "method": request.method, "path": request.url.path,
            "user_id": user_id, "status_code": status_code,
            "response_time_ms": round((time.time() - start_time) * 1000, 2),
        })


# -----------------------------
# Public routes
# -----------------------------
@app.get("/")
def root():
    return {"message": "AI Buddy API is running", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok", "uptime": round(time.time() - START_TIME, 2)}


@app.post("/users/register", status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterUserRequest):
    email = sanitize_text(request.email).lower()
    username = sanitize_text(request.username)
    full_name = sanitize_text(request.full_name)

    if find_user_by_email(email):
        raise HTTPException(status_code=409, detail="Email already exists.")
    if safe_execute(supabase.table("users").select("id").eq("username", username)).data:
        raise HTTPException(status_code=409, detail="Username already exists.")

    result = safe_execute(supabase.table("users").insert({
        "email": email, "username": username, "full_name": full_name,
        "password_hash": hash_password(request.password),
    }))

    user = remove_password_hash(result.data[0])
    token = create_access_token(user["id"])
    return {"message": "User registered.", "user": user,
            "access_token": token, "token_type": "bearer"}


@app.post("/users/login")
def login_user(request: LoginRequest):
    user = find_user_by_username_or_email(sanitize_text(request.username_or_email))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")
    password_hash = user.get("password_hash")
    if not password_hash or not verify_password(request.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")
    safe_user = remove_password_hash(user)
    token = create_access_token(user["id"])
    return {"message": "Login successful.", "user": safe_user,
            "access_token": token, "token_type": "bearer"}


@app.get("/users/me")
def get_me(request: Request):
    user = find_user_by_id(request.state.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": remove_password_hash(user)}


# -----------------------------
# Assessment
# -----------------------------
@app.post("/assessments", status_code=status.HTTP_201_CREATED)
def create_assessment(request: Request, body: AssessmentRequest):
    user_id = request.state.user_id
    payload = {
        "user_id": user_id,
        "known_languages": sanitize_text(body.known_languages),
        "experience_level": sanitize_text(body.experience_level),
        "goals": sanitize_text(body.goals),
        "background": sanitize_text(body.background),
        "hours_per_week": body.hours_per_week,
        "age": body.age,
    }
    # upsert: a user has one current assessment
    result = safe_execute(
        supabase.table("self_assessments").upsert(payload, on_conflict="user_id")
    )
    return {"message": "Assessment saved.", "assessment": result.data[0]}


@app.get("/assessments/me")
def get_my_assessment(request: Request):
    r = safe_execute(
        supabase.table("self_assessments").select("*").eq("user_id", request.state.user_id)
    )
    return {"assessment": r.data[0] if r.data else None}


# -----------------------------
# Programs
# -----------------------------
@app.post("/programs/generate", status_code=status.HTTP_201_CREATED)
def generate_user_program(request: Request):
    user_id = request.state.user_id

    a = safe_execute(supabase.table("self_assessments").select("*").eq("user_id", user_id))
    if not a.data:
        raise HTTPException(status_code=400, detail="Complete the self-assessment first.")
    assessment = a.data[0]

    user = find_user_by_id(user_id)
    username = user.get("username", "learner") if user else "learner"

    # Purge all prior progress before regenerating (FK order: feedback → submissions → program).
    existing = safe_execute(supabase.table("programs").select("id").eq("user_id", user_id))
    if existing.data:
        safe_execute(supabase.table("submission_feedback").delete().eq("user_id", user_id))
        safe_execute(supabase.table("submissions").delete().eq("user_id", user_id))
        safe_execute(supabase.table("programs").delete().eq("user_id", user_id))

    try:
        program = program_generator.generate_program(assessment, username=username)
    except Exception as e:
        log_json({"event": "program_generation_failed", "user_id": user_id, "error": repr(e)})
        raise HTTPException(status_code=502, detail="Could not generate program. Please try again.")

    prog_row = safe_execute(supabase.table("programs").insert({
        "user_id": user_id, "title": program.title,
        "summary": program.summary, "total_days": 16,
    })).data[0]

    day_rows = []
    for d in program.days:
        day_rows.append({
            "program_id": prog_row["id"],
            "day_number": d.day_number,
            "title": d.title,
            "objective": d.objective,
            "research_topics": "\n".join(d.research_topics),
            "task_description": d.task_description,
            "expected_output": d.expected_output,
            "evaluation_criteria": d.evaluation_criteria,
            "estimated_hours": d.estimated_hours,
            "unlock_condition": d.unlock_condition,
            "is_unlocked": d.day_number == 0,   # day 0 (setup) unlocked
            "is_completed": False,
        })
    safe_execute(supabase.table("program_days").insert(day_rows))

    achievements.check_and_award(supabase, user_id, "program_generated")
    return {"message": "Program generated.", "program": prog_row}


@app.get("/programs/me")
def get_my_program(request: Request):
    r = safe_execute(supabase.table("programs").select("*").eq("user_id", request.state.user_id))
    return {"program": r.data[0] if r.data else None}


@app.get("/programs/me/days")
def get_my_program_days(request: Request):
    prog = safe_execute(
        supabase.table("programs").select("id").eq("user_id", request.state.user_id)
    )
    if not prog.data:
        return {"days": []}
    days = safe_execute(
        supabase.table("program_days").select("*")
        .eq("program_id", prog.data[0]["id"])
        .order("day_number")
    )
    return {"days": days.data}


@app.get("/program-days/{day_id}")
def get_program_day(request: Request, day_id: str):
    day = safe_execute(supabase.table("program_days").select("*").eq("id", day_id))
    if not day.data:
        raise HTTPException(status_code=404, detail="Program day not found.")
    day = day.data[0]
    # ownership check
    prog = safe_execute(
        supabase.table("programs").select("user_id").eq("id", day["program_id"])
    )
    if not prog.data or prog.data[0]["user_id"] != request.state.user_id:
        raise HTTPException(status_code=403, detail="You cannot access this program day.")
    return {"day": day}


@app.get("/program-days/{day_id}/feedback")
def get_program_day_feedback(request: Request, day_id: str):
    user_id = request.state.user_id
    day = safe_execute(supabase.table("program_days").select("program_id").eq("id", day_id)).data
    if not day:
        raise HTTPException(status_code=404, detail="Program day not found.")
    prog = safe_execute(supabase.table("programs").select("user_id").eq("id", day[0]["program_id"])).data
    if not prog or prog[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You cannot access this feedback.")
    fb = safe_execute(
        supabase.table("submission_feedback").select("*")
        .eq("program_day_id", day_id).eq("user_id", user_id)
        .order("created_at", desc=True)
    ).data
    return {"feedback": fb[0] if fb else None}


# Complete Day 0 without AI evaluation (setup days have nothing to grade).
@app.post("/program-days/{day_id}/complete-setup")
def complete_setup_day(request: Request, day_id: str):
    user_id = request.state.user_id

    day_res = safe_execute(supabase.table("program_days").select("*").eq("id", day_id))
    if not day_res.data:
        raise HTTPException(status_code=404, detail="Program day not found.")
    day = day_res.data[0]

    prog = safe_execute(
        supabase.table("programs").select("user_id").eq("id", day["program_id"])
    )
    if not prog.data or prog.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You cannot access this program day.")

    if day["day_number"] != 0:
        raise HTTPException(
            status_code=403,
            detail="Only the setup day can be completed without review.",
        )

    if not day["is_completed"]:
        safe_execute(
            supabase.table("program_days").update({"is_completed": True}).eq("id", day_id)
        )
        next_day = safe_execute(
            supabase.table("program_days").select("id")
            .eq("program_id", day["program_id"])
            .eq("day_number", 1)
        )
        if next_day.data:
            safe_execute(
                supabase.table("program_days").update({"is_unlocked": True})
                .eq("id", next_day.data[0]["id"])
            )

    achievements.check_and_award(supabase, user_id, "setup_complete")
    return {"message": "Setup day completed.", "day_id": day_id}


# -----------------------------
# Submissions (text + optional file -> analyze -> evaluate -> unlock)
# -----------------------------
@app.post("/submissions", status_code=status.HTTP_201_CREATED)
async def create_submission(
    request: Request,
    program_day_id: str = Form(...),
    content: str = Form(..., min_length=1),
    file: Optional[UploadFile] = File(None),
):
    user_id = request.state.user_id

    clean_content = sanitize_text(content)
    if not clean_content:
        raise HTTPException(status_code=400, detail="Content cannot be empty.")

    # Load the program day and verify ownership + unlock state.
    day_res = safe_execute(supabase.table("program_days").select("*").eq("id", program_day_id))
    if not day_res.data:
        raise HTTPException(status_code=404, detail="Program day not found.")
    day = day_res.data[0]

    prog = safe_execute(supabase.table("programs").select("id,user_id").eq("id", day["program_id"]))
    if not prog.data or prog.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You cannot submit for this program day.")
    if not day["is_unlocked"]:
        raise HTTPException(status_code=403, detail="This day is locked. Pass the previous day first.")

    # Optional file: read, size-check, analyze, upload.
    file_url = None
    file_analysis = None
    file_raw_text = None
    if file is not None:
        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="File is too large. Maximum allowed size is 5MB.")
        try:
            result = file_processor.analyze_file(file.filename, file_bytes)
            file_analysis = result["analysis"]
            file_raw_text = result.get("raw_text")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        file_url = upload_submission_file(user_id, file.filename, file_bytes, file.content_type)

    # Store the submission first (so feedback can reference it).
    submission = safe_execute(supabase.table("submissions").insert({
        "user_id": user_id,
        "program_day_id": program_day_id,
        "day_number": day["day_number"],
        "content": clean_content,
        "file_url": file_url,
        "file_analysis": file_analysis,
    })).data[0]

    # Evaluate with Groq.
    try:
        evaluation = evaluator.evaluate_submission(
            day=day,
            submission_text=clean_content,
            file_analysis=file_analysis,
            file_raw_text=file_raw_text,
        )
    except Exception as e:
        log_json({"event": "evaluation_failed", "user_id": user_id, "error": repr(e)})
        raise HTTPException(status_code=502, detail="Could not evaluate submission. Please try again.")

    # Store feedback.
    feedback_row = safe_execute(supabase.table("submission_feedback").insert({
        "submission_id": submission["id"],
        "user_id": user_id,
        "program_day_id": program_day_id,
        "score": evaluation.score,
        "passed": evaluation.passed,
        "summary": evaluation.summary,
        "strengths": "\n".join(evaluation.strengths),
        "issues": "\n".join(evaluation.issues),
        "required_fixes": "\n".join(evaluation.required_fixes),
        "next_steps": "\n".join(evaluation.next_steps),
        "raw_feedback": evaluation.model_dump(),
    })).data[0]

    # On pass: mark day complete and unlock the next day.
    if evaluation.passed:
        safe_execute(
            supabase.table("program_days").update({"is_completed": True}).eq("id", program_day_id)
        )
        next_day = safe_execute(
            supabase.table("program_days").select("id")
            .eq("program_id", day["program_id"])
            .eq("day_number", day["day_number"] + 1)
        )
        if next_day.data:
            next_day_id = next_day.data[0]["id"]
            safe_execute(
                supabase.table("program_days").update({"is_unlocked": True})
                .eq("id", next_day_id)
            )
            # Best-effort: adapt the next day's content based on actual performance.
            # Any failure here is logged and swallowed — it must never break the pass.
            try:
                next_day_full = safe_execute(
                    supabase.table("program_days").select("*").eq("id", next_day_id)
                ).data
                if next_day_full and not next_day_full[0].get("is_completed"):
                    next_day_row = next_day_full[0]
                    # Don't overwrite a day the user already started.
                    already_submitted = safe_execute(
                        supabase.table("submissions").select("id")
                        .eq("program_day_id", next_day_id).limit(1)
                    ).data
                    if not already_submitted:
                        prog_meta = safe_execute(
                            supabase.table("programs").select("title,summary")
                            .eq("id", day["program_id"])
                        ).data
                        user_for_adapt = find_user_by_id(user_id)
                        uname = (
                            user_for_adapt.get("username", "learner")
                            if user_for_adapt else "learner"
                        )
                        adapted = program_generator.adapt_next_day(
                            program_title=prog_meta[0]["title"] if prog_meta else "",
                            program_summary=prog_meta[0]["summary"] if prog_meta else "",
                            next_day_current=next_day_row,
                            prev_day=day,
                            prev_submission_text=clean_content,
                            prev_feedback={
                                "score": evaluation.score,
                                "passed": evaluation.passed,
                                "summary": evaluation.summary,
                                "strengths": evaluation.strengths,
                                "issues": evaluation.issues,
                                "required_fixes": evaluation.required_fixes,
                            },
                            username=uname,
                        )
                        safe_execute(
                            supabase.table("program_days").update({
                                "title": adapted["title"],
                                "objective": adapted["objective"],
                                "research_topics": "\n".join(adapted["research_topics"]),
                                "task_description": adapted["task_description"],
                                "expected_output": adapted["expected_output"],
                                "evaluation_criteria": adapted["evaluation_criteria"],
                                "estimated_hours": adapted["estimated_hours"],
                                "unlock_condition": adapted["unlock_condition"],
                            }).eq("id", next_day_id)
                        )
                        log_json({
                            "event": "day_adapted", "user_id": user_id,
                            "day_id": next_day_id,
                            "day_number": next_day_row["day_number"],
                        })
            except Exception as _adapt_err:
                log_json({
                    "event": "adaptation_failed", "user_id": user_id,
                    "error": repr(_adapt_err),
                })

    new_badges = achievements.check_and_award(supabase, user_id, "web_submission", {
        "score": evaluation.score,
        "passed": evaluation.passed,
        "day_number": day["day_number"],
        "program_day_id": program_day_id,
    })
    return {
        "message": "Submission evaluated.",
        "submission": submission,
        "feedback": feedback_row,
        "evaluation": evaluation.model_dump(),
        "new_badges": new_badges,
    }


@app.get("/submissions/me")
def get_my_submissions(request: Request):
    user_id = request.state.user_id
    subs = safe_execute(
        supabase.table("submissions").select("*").eq("user_id", user_id).order("created_at", desc=True)
    )
    fb = safe_execute(
        supabase.table("submission_feedback").select("*").eq("user_id", user_id)
    )
    fb_by_sub = {f["submission_id"]: f for f in fb.data if f.get("submission_id")}
    for s in subs.data:
        s["feedback"] = fb_by_sub.get(s["id"])
    return {"submissions": subs.data}


# -----------------------------
# Progress
# -----------------------------
def compute_progress(user_id: str) -> dict:
    prog = safe_execute(supabase.table("programs").select("id,total_days").eq("user_id", user_id))
    if not prog.data:
        return {"completed_days": 0, "total_days": 16, "percentage": 0, "has_program": False}
    total = prog.data[0]["total_days"]
    days = safe_execute(
        supabase.table("program_days").select("is_completed").eq("program_id", prog.data[0]["id"])
    )
    completed = sum(1 for d in days.data if d["is_completed"])
    pct = round((completed / total) * 100) if total else 0
    return {"completed_days": completed, "total_days": total,
            "percentage": pct, "has_program": True}


@app.get("/progress/me")
def get_my_progress(request: Request):
    user_id = request.state.user_id
    p = compute_progress(user_id)
    p["user_id"] = user_id
    return p


# -----------------------------
# Achievements
# -----------------------------
@app.get("/achievements/me")
def get_my_achievements(request: Request):
    user_id = request.state.user_id

    # Guard: if the achievements table doesn't exist yet, return zeroed data.
    try:
        earned_res = safe_execute(
            supabase.table("achievements").select("badge_key,earned_at").eq("user_id", user_id)
        )
        earned_by_key = {r["badge_key"]: r["earned_at"] for r in (earned_res.data or [])}
    except Exception as _e:
        log_json({"event": "achievements_table_missing", "error": repr(_e)})
        earned_by_key = {}

    prog_res = safe_execute(supabase.table("programs").select("id").eq("user_id", user_id))
    completed_days = 0
    if prog_res.data:
        done_res = safe_execute(
            supabase.table("program_days")
            .select("id", count="exact")
            .eq("program_id", prog_res.data[0]["id"])
            .eq("is_completed", True)
        )
        completed_days = done_res.count or 0

    total_subs = (
        safe_execute(
            supabase.table("submissions").select("id", count="exact").eq("user_id", user_id)
        ).count or 0
    )

    all_badges = [
        {
            **b,
            "earned": b["key"] in earned_by_key,
            "earned_at": earned_by_key.get(b["key"]),
        }
        for b in achievements.BADGES
    ]

    return {
        "badges": all_badges,
        "stats": {
            "earned": len(earned_by_key),
            "total": len(achievements.BADGES),
            "completed_days": completed_days,
            "total_submissions": total_subs,
        },
    }


# -----------------------------
# CLI
# -----------------------------
def _get_current_day(user_id: str):
    """Return the lowest unlocked+incomplete day for this user, or None."""
    prog = safe_execute(supabase.table("programs").select("id").eq("user_id", user_id))
    if not prog.data:
        return None, None
    program_id = prog.data[0]["id"]
    days = safe_execute(
        supabase.table("program_days").select("*")
        .eq("program_id", program_id)
        .eq("is_unlocked", True)
        .eq("is_completed", False)
        .order("day_number")
    ).data
    return days[0] if days else None, program_id


@app.post("/cli/check")
def cli_check(request: Request, body: CliCheckRequest):
    user_id = request.state.user_id

    day, _ = _get_current_day(user_id)
    if not day:
        raise HTTPException(status_code=400, detail="No active day to check.")

    try:
        evaluation = evaluator.evaluate_submission(
            day=day,
            submission_text=body.project_text,
            file_analysis=None,
        )
    except Exception as e:
        log_json({"event": "cli_eval_failed", "user_id": user_id, "error": repr(e)})
        raise HTTPException(status_code=502, detail="Could not evaluate submission. Please try again.")

    new_badges = []
    if not body.dry_run:
        submission = safe_execute(supabase.table("submissions").insert({
            "user_id": user_id,
            "program_day_id": day["id"],
            "day_number": day["day_number"],
            "content": f"[CLI submission]\n\n{body.project_text[:500]}",
            "file_url": None,
            "file_analysis": None,
            "source": "cli",
        })).data[0]

        safe_execute(supabase.table("submission_feedback").insert({
            "submission_id": submission["id"],
            "user_id": user_id,
            "program_day_id": day["id"],
            "score": evaluation.score,
            "passed": evaluation.passed,
            "summary": evaluation.summary,
            "strengths": "\n".join(evaluation.strengths),
            "issues": "\n".join(evaluation.issues),
            "required_fixes": "\n".join(evaluation.required_fixes),
            "next_steps": "\n".join(evaluation.next_steps),
            "raw_feedback": evaluation.model_dump(),
        }))

        if evaluation.passed:
            safe_execute(
                supabase.table("program_days").update({"is_completed": True}).eq("id", day["id"])
            )
            next_day = safe_execute(
                supabase.table("program_days").select("id")
                .eq("program_id", day["program_id"])
                .eq("day_number", day["day_number"] + 1)
            )
            if next_day.data:
                safe_execute(
                    supabase.table("program_days").update({"is_unlocked": True})
                    .eq("id", next_day.data[0]["id"])
                )

        new_badges = achievements.check_and_award(supabase, user_id, "cli_submission", {
            "score": evaluation.score,
            "passed": evaluation.passed,
            "day_number": day["day_number"],
            "program_day_id": day["id"],
        })

    return {
        "evaluation": evaluation.model_dump(),
        "day_number": day["day_number"],
        "dry_run": body.dry_run,
        "new_badges": new_badges,
    }


@app.post("/cli/ask")
def cli_ask(request: Request, body: CliAskRequest):
    user_id = request.state.user_id

    progress = compute_progress(user_id)
    current_day, program_id = _get_current_day(user_id)

    all_days = []
    if program_id:
        all_days = safe_execute(
            supabase.table("program_days").select("day_number,is_completed,is_unlocked")
            .eq("program_id", program_id).order("day_number")
        ).data

    days_summary = ", ".join(
        f"Day {d['day_number']}({'done' if d['is_completed'] else 'active' if d['is_unlocked'] else 'locked'})"
        for d in all_days
    )

    if current_day:
        day_context = (
            f"Day {current_day['day_number']}: {current_day['title']}\n"
            f"Objective: {current_day.get('objective', '')}\n"
            f"Task: {current_day.get('task_description', '')}"
        )
    else:
        day_context = "No active day — all days may be complete or no program generated."

    prompt = (
        f"You are HyperSensei, an expert AI coding mentor for a self-driving bootcamp.\n"
        f"The learner's progress: {progress['completed_days']}/{progress['total_days']} days "
        f"({progress['percentage']}%).\nDays: {days_summary}\n"
        f"Current task:\n{day_context}\n\n"
        f"The learner asks: {sanitize_text(body.question)}\n\n"
        f"Answer directly in second person. Nudge and hint — do NOT give complete solutions. "
        f"Be concise (under 200 words)."
    )

    try:
        resp = _groq_client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=400,
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as e:
        log_json({"event": "cli_ask_failed", "user_id": user_id, "error": repr(e)})
        raise HTTPException(status_code=502, detail="Could not generate answer. Please try again.")

    safe_execute(supabase.table("cli_questions").insert({
        "user_id": user_id,
        "question": sanitize_text(body.question),
        "answer": answer,
    }))

    achievements.check_and_award(supabase, user_id, "cli_ask")
    return {"answer": answer, "progress": progress, "current_day": current_day}


# -----------------------------
# Explain (highlight-to-explain)
# -----------------------------
class DefineRequest(BaseModel):
    text: str
    context: str = ""


@app.post("/define")
def define_term(request: Request, body: DefineRequest):
    user_id = request.state.user_id  # auth required by middleware

    raw_text = sanitize_text(body.text)[:500]
    raw_ctx = sanitize_text(body.context)[:200]

    if not raw_text:
        raise HTTPException(status_code=400, detail="text is required")

    ctx_line = f"\n(Background only, do not mention in your answer: the user is on the page titled \"{raw_ctx}\".)" if raw_ctx else ""
    prompt = (
        f"Explain the following highlighted term to the user in 2-4 sentences, second person.\n"
        f"Explain ONLY this term: \"{raw_text}\"\n"
        f"Do not mention or quote any context, URLs, ids, or paths in your answer.\n"
        f"Use the platform knowledge below only if the term is platform-specific "
        f"(e.g. hypersensei, program day, shippable, push vs check, badge names); "
        f"otherwise explain it as a general programming or AI concept.\n\n"
        f"Platform knowledge:\n{platform_knowledge.PLATFORM_INFO}"
        f"{ctx_line}"
    )

    try:
        resp = _groq_client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=220,
        )
        explanation = resp.choices[0].message.content.strip()
    except Exception as e:
        log_json({"event": "define_failed", "user_id": user_id, "error": repr(e)})
        raise HTTPException(status_code=502, detail="Could not generate explanation. Please try again.")

    return {"explanation": explanation}


# -----------------------------
# HyperSensei companion lines
# -----------------------------
_SENSEI_VOICE = {
    "sensei": "wise and calm, dry wit, sparing with praise, gently encouraging on failure — never preachy",
    "hype":   "high-energy enthusiastic cheerleader, genuinely excited, momentum-focused",
    "drill":  "tough-love drill instructor: gruff and blunt, but never cruel — always pushes forward",
    "zen":    "serene and minimal, almost poetic, one breath at a time",
}

_SENSEI_SITUATION = {
    "dashboard":         "browsing their progress dashboard and seeing their stats",
    "program":           "looking at their list of program days",
    "task":              "reading today's task description before starting",
    "submit":            "on the submission page, about to write up what they built",
    "profile":           "viewing their profile and earned badges",
    "empty-no-program":  "on the dashboard but hasn't generated a program yet",
    "pass":              "just passed a day evaluation",
    "fail":              "just failed a day evaluation — be constructive and encouraging, never harsh",
    "perfect10":         "just scored a perfect 10 out of 10 on an evaluation",
    "badge_earned":      "just earned a new achievement badge",
    "streak_milestone":  "just hit a consistency streak milestone",
    "program_complete":  "just completed their entire program",
    "day_unlocked":      "just unlocked the next day in their program",
    "login":             "just logged in",
    "revive":            "just re-summoned the AI companion after previously dismissing it",
}


class SenseiLineRequest(BaseModel):
    personality: str = "sensei"
    trigger: str
    user_name: str = ""


@app.post("/sensei/line")
def sensei_line(request: Request, body: SenseiLineRequest):
    request.state.user_id  # auth required

    personality = body.personality if body.personality in _SENSEI_VOICE else "sensei"
    voice       = _SENSEI_VOICE[personality]
    situation   = _SENSEI_SITUATION.get(body.trigger, body.trigger.replace("_", " "))
    name_part   = f" Their name is {body.user_name.strip()}." if body.user_name.strip() else ""

    prompt = (
        f"You are HyperSensei, a compact AI study companion on a self-driving coding bootcamp.{name_part}\n"
        f"Personality: {voice}.\n"
        f"Situation: the learner is {situation}.\n"
        f"Write exactly ONE line to say to them — 1 to 2 short sentences maximum.\n"
        f"Rules: second person, plain text only, no quotation marks, no em-dashes, no lists, no hashtags. "
        f"Be concrete and specific to the situation. Match the personality voice precisely."
    )

    try:
        resp = _groq_client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.88,
            max_tokens=80,
        )
        line = resp.choices[0].message.content.strip().strip('"\'')
    except Exception as e:
        log_json({"event": "sensei_line_failed", "error": repr(e)})
        raise HTTPException(status_code=502, detail="Could not generate line.")

    return {"line": line}


# -----------------------------
# Simulate (test harness — ENABLE_SIMULATE=true required)
# -----------------------------
@app.post("/simulate/evaluate")
def simulate_evaluate(body: SimulateEvaluateRequest):
    """
    Run the evaluation engine against an arbitrary task + submission.
    No database reads or writes. Enabled only when ENABLE_SIMULATE=true.
    """
    if not ENABLE_SIMULATE:
        raise HTTPException(status_code=404, detail="Not found.")

    day = {
        "title":               body.task.title,
        "objective":           body.task.objective,
        "task_description":    body.task.task_description,
        "expected_output":     body.task.expected_output,
        "evaluation_criteria": body.task.evaluation_criteria,
    }

    try:
        evaluation = evaluator.evaluate_submission(
            day=day,
            submission_text=body.submission_text,
            file_analysis=body.file_analysis,
            file_raw_text=None,
        )
    except Exception as e:
        log_json({"event": "simulate_eval_failed", "error": repr(e)})
        raise HTTPException(
            status_code=502,
            detail=f"Evaluation engine error: {type(e).__name__}: {str(e)[:200]}",
        )

    return evaluation.model_dump()


@app.post("/simulate/submit")
def simulate_submit(body: SimulateSubmitRequest):
    """
    Full submission simulation: evaluate Day N, then adapt Day N+1.
    Mirrors /submissions exactly — no database touched.
    Requires ENABLE_SIMULATE=true.
    """
    if not ENABLE_SIMULATE:
        raise HTTPException(status_code=404, detail="Not found.")

    day_dict = body.day.model_dump()

    # ── Step 1: evaluate (same as /simulate/evaluate) ────────────────────────
    try:
        evaluation = evaluator.evaluate_submission(
            day=day_dict,
            submission_text=body.submission_text,
            file_analysis=body.file_analysis,
            file_raw_text=None,
        )
    except Exception as e:
        log_json({"event": "simulate_submit_eval_failed", "error": repr(e)})
        raise HTTPException(
            status_code=502,
            detail=f"Evaluation error: {type(e).__name__}: {str(e)[:200]}",
        )

    # ── Step 2: generate/adapt next day (only if passed) ─────────────────────
    adapted_day = None
    if evaluation.passed:
        next_day_number = (day_dict.get("day_number") or 1) + 1
        feedback = {
            "score":          evaluation.score,
            "passed":         evaluation.passed,
            "summary":        evaluation.summary,
            "strengths":      evaluation.strengths,
            "issues":         evaluation.issues,
            "required_fixes": evaluation.required_fixes,
        }
        try:
            if body.next_day_draft:
                # Refine the existing draft (mirrors real /submissions behaviour)
                adapted_day = program_generator.adapt_next_day(
                    program_title=body.program_title,
                    program_summary=body.program_summary,
                    next_day_current=body.next_day_draft.model_dump(),
                    prev_day=day_dict,
                    prev_submission_text=body.submission_text,
                    prev_feedback=feedback,
                    username=body.username,
                )
            else:
                # No draft available — generate Day N+1 from scratch
                adapted_day = program_generator.generate_next_day(
                    program_title=body.program_title,
                    program_summary=body.program_summary,
                    prev_day=day_dict,
                    prev_submission_text=body.submission_text,
                    prev_feedback=feedback,
                    next_day_number=next_day_number,
                    username=body.username,
                )
        except Exception as e:
            log_json({"event": "simulate_next_day_failed", "error": repr(e)})
            raise HTTPException(
                status_code=502,
                detail=f"Next-day generation error: {type(e).__name__}: {str(e)[:200]}",
            )

    return {
        "evaluation": evaluation.model_dump(),
        "adapted_day": adapted_day,
        "adapted": adapted_day is not None,
        "generated_fresh": evaluation.passed and body.next_day_draft is None,
    }


# -----------------------------
# Admin
# -----------------------------
@app.get("/admin/users")
def admin_list_users(request: Request, limit: int = 10, offset: int = 0):
    require_admin(request.state.user_id)

    if limit not in (10, 20, 50):
        limit = 10
    if offset < 0:
        offset = 0

    count_res = (
        supabase.table("users")
        .select("id", count="exact")
        .not_.like("email", "%@example.com")
        .execute()
    )
    total = count_res.count or 0

    users = (
        supabase.table("users")
        .select("id,email,username,full_name,is_admin,created_at")
        .not_.like("email", "%@example.com")
        .order("created_at")
        .range(offset, offset + limit - 1)
        .execute()
        .data
    )

    progress_by_user = bulk_compute_progress(users)
    enriched = [{**u, "progress": progress_by_user[u["id"]]} for u in users]

    return {"users": enriched, "total": total, "limit": limit, "offset": offset}


@app.get("/admin/users/search")
def admin_search_users(request: Request, q: str = ""):
    require_admin(request.state.user_id)

    q = sanitize_text(q).strip()
    if not q:
        return {"users": []}

    uuid_re = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
    )
    if uuid_re.match(q):
        users = safe_execute(
            supabase.table("users")
            .select("id,email,username,full_name,is_admin,created_at")
            .eq("id", q)
            .not_.like("email", "%@example.com")
        ).data
    else:
        users = safe_execute(
            supabase.table("users")
            .select("id,email,username,full_name,is_admin,created_at")
            .or_(f"username.ilike.%{q}%,email.ilike.%{q}%")
            .not_.like("email", "%@example.com")
            .limit(50)
        ).data

    progress_by_user = bulk_compute_progress(users)
    enriched = [{**u, "progress": progress_by_user[u["id"]]} for u in users]
    return {"users": enriched}


@app.get("/admin/users/{user_id}/progress")
def admin_user_progress(request: Request, user_id: str):
    require_admin(request.state.user_id)
    days = []
    prog = safe_execute(
        supabase.table("programs").select("id").eq("user_id", user_id)
    )
    if prog.data:
        days = safe_execute(
            supabase.table("program_days").select("*")
            .eq("program_id", prog.data[0]["id"])
            .order("day_number")
        ).data
    summary = compute_progress(user_id)
    return {"user_id": user_id, "progress": summary, "days": days}


@app.get("/admin/users/{user_id}/submissions")
def admin_user_submissions(request: Request, user_id: str):
    require_admin(request.state.user_id)
    subs = safe_execute(
        supabase.table("submissions").select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    fb = safe_execute(
        supabase.table("submission_feedback").select("*").eq("user_id", user_id)
    )
    fb_by_sub = {f["submission_id"]: f for f in fb.data if f.get("submission_id")}
    for s in subs.data:
        s["feedback"] = fb_by_sub.get(s["id"])
    return {"user_id": user_id, "submissions": subs.data}


# NOTE: Before using the pass endpoint, run this migration in Supabase SQL editor:
#   alter table public.submission_feedback alter column submission_id drop not null;
@app.post("/admin/program-days/{day_id}/pass", status_code=status.HTTP_201_CREATED)
def admin_pass_day(request: Request, day_id: str, body: AdminPassDayRequest):
    admin_user = require_admin(request.state.user_id)
    admin_label = admin_user.get("username") or admin_user.get("email", "admin")

    day_res = safe_execute(
        supabase.table("program_days").select("*").eq("id", day_id)
    )
    if not day_res.data:
        raise HTTPException(status_code=404, detail="Program day not found.")
    day = day_res.data[0]

    prog_res = safe_execute(
        supabase.table("programs").select("id,user_id").eq("id", day["program_id"])
    )
    if not prog_res.data:
        raise HTTPException(status_code=404, detail="Program not found.")
    target_user_id = prog_res.data[0]["user_id"]

    safe_execute(
        supabase.table("program_days")
        .update({"is_completed": True, "is_unlocked": True})
        .eq("id", day_id)
    )

    next_day = safe_execute(
        supabase.table("program_days").select("id")
        .eq("program_id", day["program_id"])
        .eq("day_number", day["day_number"] + 1)
    )
    if next_day.data:
        safe_execute(
            supabase.table("program_days")
            .update({"is_unlocked": True})
            .eq("id", next_day.data[0]["id"])
        )

    feedback = safe_execute(
        supabase.table("submission_feedback").insert({
            "submission_id": None,
            "user_id": target_user_id,
            "program_day_id": day_id,
            "score": body.score,
            "passed": True,
            "summary": f"[Admin override by {admin_label}] {sanitize_text(body.summary)}",
            "strengths": "",
            "issues": "",
            "required_fixes": "",
            "next_steps": "",
            "raw_feedback": {"admin_override": True, "admin_id": request.state.user_id},
        })
    )
    return {"message": "Day passed.", "feedback": feedback.data[0]}
