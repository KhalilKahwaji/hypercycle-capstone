# HyperCycle — Self-Driving AI Bootcamp

A full-stack AI learning platform. A user signs up, fills a self-assessment, and an
LLM generates a **personalized 15-day program**. They work through it day by day,
submit work (text + optional file), and an LLM evaluates each submission, scores it,
and unlocks the next day if they pass. Admins can see every user and their progress.

This is the HyperCycle 15-day capstone, built on the tools from Days 1–9.

## Stack

| Layer | Tool |
|------|------|
| Frontend | React + Vite (React Router, axios, recharts) |
| Backend | FastAPI (JWT auth, rate limiting, structured logging) |
| Database + Storage | Supabase (Postgres + Storage bucket) |
| LLM | Groq — `llama-3.3-70b-versatile` |
| File processing | pdfplumber + Groq structured extraction (Day 7 module) |
| RAG (optional) | ChromaDB over precedent programs |

## What carried over from Days 1–9

- **Day 4/9 `api.py`** → the backbone of `backend/api.py` (auth, rate limit, sanitization, logging).
- **Day 7 `file_processor.py`** → integrated directly into the backend (no separate service).
- **Day 6 retry-loop concept** → simplified: a failed submission just lets the user resubmit.
- **Day 5 RAG** → reworked as an optional bonus using ChromaDB's built-in embeddings (Ollama doesn't deploy).
- Days 1, 2, 3, 8 were prototypes; their lessons are folded in but the files aren't shipped.

## Architecture

```
React (Vercel) ──Bearer JWT──► FastAPI (Railway/Render) ──► Supabase (Postgres + Storage)
                                      │
                                      ├─ file_processor.py  (analyze uploads)
                                      ├─ program_generator.py (Groq → 15-day program)
                                      └─ evaluator.py        (Groq → score + feedback)
                                      └────────────► Groq API
```

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. Run `sql/schema.sql` in the SQL editor. (Safe to re-run; it `alter`s your existing `users`/`submissions`.)
3. Create a **public** Storage bucket named `submissions`.
4. Settings → API: copy the project URL and the **service_role** key.
5. Make yourself an admin:
   ```sql
   update users set is_admin = true where email = 'you@example.com';
   ```

### 2. Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill in your keys
uvicorn api:app --reload    # http://localhost:8000  (docs at /docs)
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_URL=http://localhost:8000
npm run dev                 # http://localhost:5173
```

## Environment variables

**Backend (`backend/.env`)**
| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (backend bypasses RLS) |
| `GROQ_API_KEY` | Groq API key |
| `GROQ_MODEL` | defaults to `llama-3.3-70b-versatile` |
| `JWT_SECRET_KEY` | long random string |
| `ALLOWED_ORIGINS` | comma-separated; your Vercel URL in prod |
| `USE_RAG` | `true` to enable the ChromaDB precedent RAG bonus |

**Frontend (`frontend/.env`)**
| Var | Purpose |
|-----|---------|
| `VITE_API_URL` | URL of the deployed backend |

## Deployment

- **Backend → Railway/Render.** Root `backend/`. Start command (in `Procfile`):
  `uvicorn api:app --host 0.0.0.0 --port $PORT`. Set all backend env vars. Set
  `ALLOWED_ORIGINS` to your Vercel URL.
- **Frontend → Vercel.** Root `frontend/`. Build `npm run build`, output `dist`.
  Set `VITE_API_URL` to the Railway/Render backend URL.
- **Supabase** is already hosted.

## API endpoints

Auth: `POST /users/register`, `POST /users/login`, `GET /users/me`
Assessment: `POST /assessments`, `GET /assessments/me`
Programs: `POST /programs/generate`, `GET /programs/me`, `GET /programs/me/days`, `GET /program-days/{id}`
Submissions: `POST /submissions` (text + optional file → analyze → evaluate → unlock), `GET /submissions/me`
Progress: `GET /progress/me`
Admin: `GET /admin/users`, `GET /admin/users/{id}/progress`, `GET /admin/users/{id}/submissions`
Public: `/`, `/health`, register, login, `/docs`

## Tests

```bash
cd backend
pip install pytest requests
uvicorn api:app --reload          # in one terminal
pytest test_capstone_api.py -v    # in another
pytest test_capstone_api.py -v -m "not slow"   # skip LLM calls
```

Covers: register, login, assessment, program generation, submit + feedback, locked-day
rejection, duplicate/resubmit, unauthorized access, admin access control, file-too-large,
bad file type, next-day unlock.

## Demo flow (for the 5-minute video)

1. Register → land on Self-Assessment.
2. Fill assessment → generate program → see 15 tailored days (only Day 1 unlocked).
3. Open Day 1 → read spec → submit work + a file → watch it get scored.
4. Pass → Day 2 unlocks. Show Dashboard score chart updating.
5. Switch to an admin account → All Users → click a user → see their progress + feedback.
6. Show the deployed URLs (not localhost).
