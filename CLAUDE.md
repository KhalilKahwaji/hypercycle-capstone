# CLAUDE.md — HyperCycle Capstone

## Project Overview
AI Buddy is a personalized AI-learning platform. A user self-assesses (goals, experience, hours/week), the backend generates a custom 16-day program (Day 0–15) via Groq, and the learner submits daily work via a GitHub repo link or the `hypersensei` CLI. Each submission is AI-evaluated (score 1–10, pass ≥7), which unlocks the next day and adapts its content. Gamification (badges) and an AI sensei (HyperSensei chatbot) are layered on top.

---

## Architecture

| Layer | Entry point | Notes |
|-------|-------------|-------|
| Backend API | `backend/api.py` | FastAPI, single file, ~1400 lines |
| Frontend SPA | `frontend/src/App.jsx` | React 18 + React Router 6, Vite 5 |
| Database | Supabase (PostgreSQL) | All tables in Supabase; service role key used server-side |
| LLM | Groq via OpenAI SDK | `_groq_client` in api.py; model from `GROQ_MODEL` env |
| File storage | Supabase Storage | buckets: `submissions`, `cvs` |
| Auth | Custom JWT | HS256, 24 h expiry, stored as `hc_token` in localStorage |
| GitHub OAuth | api.py `/auth/github/*` | Two flows: login-start (HMAC state) vs connect-start (DB state) |

### Key backend files
| File | Purpose |
|------|---------|
| `api.py` | All endpoints, middleware, helpers |
| `evaluator.py` | Groq evaluation; score/pass/feedback |
| `program_generator.py` | 16-day program generation + `adapt_next_day` |
| `github_reader.py` | Reads repo tree+blobs via GitHub REST API; OAuth token required |
| `file_processor.py` | Analyzes uploaded files (.py .md .pdf etc.) via Groq |
| `achievements.py` | Badge award logic |
| `platform_knowledge.py` | Static docs injected into LLM prompts |
| `rag_store.py` | Optional ChromaDB RAG (only when `USE_RAG=true`) |
| `test_capstone_api.py` | Pytest integration tests (needs running backend) |

### Key frontend files
| Path | Purpose |
|------|---------|
| `src/context/AuthContext.jsx` | Auth state; `login`, `register`, `loginWithToken`, `logout` |
| `src/context/SenseiContext.jsx` | Event bus for HyperSensei reactions |
| `src/api/client.js` | Axios instance; attaches `hc_token` from localStorage |
| `src/pages/Login.jsx` | Password + GitHub OAuth login |
| `src/pages/Register.jsx` | Password + GitHub OAuth signup |
| `src/pages/GitHubCallback.jsx` | Handles `/auth/callback?token=JWT&new=bool` redirect |
| `src/pages/CurrentTask.jsx` | Day view + Day 0 GitHub setup (2-step gate) |
| `src/pages/SubmitWork.jsx` | GitHub-only submission (web); CLI unaffected |
| `src/pages/Profile.jsx` | GitHubConnectionCard, badges, CV upload, edit |

---

## Tech Stack

| Concern | Tech |
|---------|------|
| Backend language | Python 3.11+ |
| Backend framework | FastAPI + Uvicorn |
| Frontend | React 18, React Router 6, Vite 5 |
| Styling | Custom CSS variables (`src/index.css`) |
| DB | Supabase (PostgreSQL + Storage) |
| LLM | Groq (`llama-3.3-70b-versatile` default) |
| Auth tokens | `python-jose` (JWT) + `bcrypt` |
| Package managers | `pip` (backend), `npm` (frontend) |

---

## Running Locally

```bash
# Backend
cd backend
cp .env.example .env          # fill in secrets
pip install -r requirements.txt
uvicorn api:app --reload      # http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173

# Tests (backend must be running)
cd backend
pytest test_capstone_api.py -v -m "not slow"
```

---

## Environment Variables (`backend/.env`)

| Var | Required | Purpose |
|-----|----------|---------|
| `SUPABASE_URL` | ✓ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Bypasses RLS |
| `JWT_SECRET_KEY` | ✓ | Token signing; also used for HMAC OAuth state |
| `GROQ_API_KEY` | ✓ | LLM inference |
| `GROQ_MODEL` | — | Defaults to `llama-3.3-70b-versatile` |
| `ALLOWED_ORIGINS` | — | CORS; comma-separated |
| `FRONTEND_URL` | ✓ | OAuth redirect target |
| `GITHUB_CLIENT_ID/SECRET` | ✓ for OAuth | GitHub OAuth app creds |
| `GITHUB_CALLBACK_URL` | ✓ for OAuth | Must match GitHub app settings exactly |
| `ENABLE_SIMULATE` | — | Enables `POST /simulate/*` (dev only) |
| `USE_RAG` | — | Enables ChromaDB RAG for program generation |

---

## Auth & Middleware

- **Public paths**: `/`, `/health`, `/users/register`, `/users/login`, `/auth/github/login-start`, `/auth/github/callback`, `/docs`, `/openapi.json`, `/redoc`; plus `/simulate/*` when `ENABLE_SIMULATE=true`
- **All other routes**: require `Authorization: Bearer <JWT>` → decoded in middleware → `request.state.user_id`
- **Social accounts**: `password_hash = "!github_oauth"` (sentinel); valid bcrypt always starts with `$`
- **GitHub OAuth login flow**: `GET /auth/github/login-start` (public, HMAC state) → GitHub → `GET /auth/github/callback` → creates/merges user → issues JWT → redirects to `/auth/callback?token=JWT&new=bool`
- **GitHub OAuth connect flow**: `GET /auth/github/start` (requires JWT, DB state) → same callback → attaches token to existing account → redirects to `/profile?github=connected`

---

## Supabase Schema (key tables)

`users` · `self_assessments` · `programs` · `program_days` · `submissions` · `submission_feedback` · `achievements`

Notable columns: `users.github_access_token/username/connected_at/oauth_state`, `programs.github_owner/repo/subfolder`, `submission_feedback.repo_summary` (prior-state memory for grading), `submissions.source` (`web`/`cli`/`github`)

---

## Conventions

- **No comments** unless the WHY is non-obvious
- **Sensitive fields stripped** by `remove_password_hash()` before any response (strips `password_hash`, `github_access_token`, `github_oauth_state`)
- **`safe_execute(query, retries=3)`** wraps all Supabase calls
- **CSS variables** defined in `src/index.css`: `--amber`, `--cyan`, `--green`, `--faint`, `--text`, `--radius`, `--display`
- **lucide-react** for icons; `Github` icon not exported — use inline SVG or `GitBranch`
- **Error responses**: FastAPI `HTTPException(status_code, detail=str)` → frontend reads `e.response?.data?.detail || e.message`

---

## Where to Look

| Task | File(s) to edit |
|------|----------------|
| Add a backend endpoint | `backend/api.py` (add route + Pydantic model if needed) |
| Add a frontend page | `frontend/src/pages/NewPage.jsx` + route in `src/App.jsx` |
| Change what AI evaluates | `backend/evaluator.py` — `build_system_prompt` / `build_user_prompt` |
| Change program generation | `backend/program_generator.py` — `generate_program` / `adapt_next_day` |
| Change auth/middleware | `backend/api.py` — `is_public_path`, `auth_logging_rate_limit_middleware` |
| Change GitHub OAuth | `backend/api.py` — `/auth/github/*` endpoints + `_make_login_state` / `_find_or_create_github_user` |
| Change GitHub repo reading | `backend/github_reader.py` — `fetch_repo_text` / `validate_repo` |
| Add a badge | `backend/achievements.py` + `frontend/src/components/BadgeIcon.jsx` |
| Change Day 0 gate | `backend/api.py` `complete_setup_day` + `frontend/src/pages/CurrentTask.jsx` |
| Change submission UI | `frontend/src/pages/SubmitWork.jsx` (web only; CLI uses `POST /submissions`) |
