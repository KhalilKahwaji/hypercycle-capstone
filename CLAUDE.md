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
| `llm_router.py` | LLM routing layer: `chat(system, user, difficulty)` → Groq (default) or Claude/Ollama when `USE_MULTI_LLM=true`; fails closed to Groq |
| `evaluator.py` | Evaluation via `llm_router` (difficulty from day_number); score/pass/feedback |
| `program_generator.py` | 16-day program generation + `adapt_next_day`; grounds generation in retrieved missions (RAG) and falls back to `precedents.py` |
| `mission_retrieval.py` | Mission RAG: embeds the learner's assessment (Gemini), pgvector similarity search + weighted re-rank, returns real mission `content` docs to adapt. See `MISSION_RAG.md` |
| `ingest_missions.py` | One-off script: embeds mission YAML and upserts into the `missions` table (run locally when missions change) |
| `github_reader.py` | Reads repo tree+blobs via GitHub REST API; OAuth token required |
| `file_processor.py` | Analyzes uploaded files (.py .md .pdf etc.) via Groq |
| `achievements.py` | Badge award logic |
| `platform_knowledge.py` | Static docs injected into LLM prompts |
| `precedents.py` | Hand-written precedent programs; fallback grounding when mission RAG is off/empty |
| `rag_store.py` | Optional ChromaDB RAG over precedents (only when `USE_RAG=true`) |
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
| DB | Supabase (PostgreSQL + Storage + pgvector) |
| LLM | Groq (`llama-3.3-70b-versatile` default) |
| Embeddings | Gemini `models/gemini-embedding-001` (768-dim) via `google-generativeai`, for mission RAG |
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
| `USE_RAG` | — | Enables ChromaDB RAG over precedents (fallback grounding) |
| `USE_MISSION_RAG` | — | Default `true`. Ground generation in real retrieved missions; `false` falls back to `precedents.py` |
| `GEMINI_API_KEY` | ✓ for mission RAG | Embeds the retrieval query (Gemini). Missing key → graceful fallback to precedents |
| `MISSION_EMBED_MODEL` | — | Defaults to `models/gemini-embedding-001`. **Must match the model that populated `missions.embedding`** |
| `USE_MULTI_LLM` | — | Default `false` (all calls → Groq). `true`: hard tasks → Claude, easy → Ollama; failures fall back to Groq |
| `ANTHROPIC_API_KEY/MODEL` | ✓ if multi-LLM | Claude for hard tasks; model defaults to `claude-opus-4-8`. Needs `pip install anthropic` |
| `OLLAMA_BASE_URL/MODEL` | — | Ollama OpenAI-compatible endpoint for easy tasks; defaults `http://localhost:11434/v1` / `llama3.2` |
| `COMPLEXITY_THRESHOLD_DAY` | — | Default `8`. Evaluations for day ≥ this route as "hard" |

---

## Auth & Middleware

- **Public paths**: `/`, `/health`, `/users/register`, `/users/login`, `/auth/github/login-start`, `/auth/github/callback`, `/docs`, `/openapi.json`, `/redoc`; plus `/simulate/*` when `ENABLE_SIMULATE=true`
- **All other routes**: require `Authorization: Bearer <JWT>` → decoded in middleware → `request.state.user_id`
- **Social accounts**: `password_hash = "!github_oauth"` (sentinel); valid bcrypt always starts with `$`
- **GitHub OAuth login flow**: `GET /auth/github/login-start` (public, HMAC state) → GitHub → `GET /auth/github/callback` → creates/merges user → issues JWT → redirects to `/auth/callback?token=JWT&new=bool`
- **GitHub OAuth connect flow**: `GET /auth/github/start` (requires JWT, DB state) → same callback → attaches token to existing account → redirects to `/profile?github=connected`

---

## Supabase Schema (key tables)

`users` · `self_assessments` · `programs` · `program_days` · `submissions` · `submission_feedback` · `achievements` · `missions`

Notable columns: `users.github_access_token/username/connected_at/oauth_state`, `programs.github_owner/repo/subfolder`, `submission_feedback.repo_summary` (prior-state memory for grading), `submissions.source` (`web`/`cli`/`github`)

**`missions`** (mission RAG source, ~130 rows): `id`, `version`, `title`, `track`, `difficulty_tier` (int 1–4), `min_age_band` (text, e.g. `band_15_17`), `est_minutes` (int), `summary`, `goal`, `content` (jsonb — full mission doc), `embedding` (`vector(768)`, pgvector). Queried via the **`match_missions(query_embedding vector(768), match_count int, max_min_age int)`** SQL RPC (cosine distance `<=>`). See `MISSION_RAG.md`.

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
| Change which model handles a task | `backend/llm_router.py` — routing table in `chat()`, `evaluation_difficulty` |
| Change program generation | `backend/program_generator.py` — `generate_program` / `adapt_next_day` |
| Change mission retrieval / RAG grounding | `backend/mission_retrieval.py` — `retrieve_missions` (query, ranking weights, age filter); prompt grounding in `program_generator.py` `_mission_context` / `build_user_prompt`. See `MISSION_RAG.md` |
| Re-ingest missions / change embeddings | `backend/ingest_missions.py` (keep its model in sync with `MISSION_EMBED_MODEL`) |
| Change auth/middleware | `backend/api.py` — `is_public_path`, `auth_logging_rate_limit_middleware` |
| Change GitHub OAuth | `backend/api.py` — `/auth/github/*` endpoints + `_make_login_state` / `_find_or_create_github_user` |
| Change GitHub repo reading | `backend/github_reader.py` — `fetch_repo_text` / `validate_repo` |
| Add a badge | `backend/achievements.py` + `frontend/src/components/BadgeIcon.jsx` |
| Change Day 0 gate | `backend/api.py` `complete_setup_day` + `frontend/src/pages/CurrentTask.jsx` |
| Change submission UI | `frontend/src/pages/SubmitWork.jsx` (web only; CLI uses `POST /submissions`) |
