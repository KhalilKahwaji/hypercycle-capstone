# Sprint Log — HyperCycle Capstone

---

## ✅ Fix onboarding (adding CV, GitHub account…)

**What was done**

The onboarding and profile flows were fully rebuilt. The `Onboarding.jsx` page became a
multi-step guided setup: environment check (Node/Python/Git), GitHub account connection,
and optional CV upload. `Profile.jsx` was extended with a `GitHubConnectionCard` (connect /
disconnect, status badge), a CV upload section, an editable profile form, and badges
organized by category (Getting Started, Submissions, Performance, Milestones, CLI Mastery).

The backend gained endpoints for CV storage (`POST /onboarding/cv` → Supabase Storage
bucket `cvs`) and the GitHub OAuth connect flow (`GET /auth/github/start` → callback →
store token). `remove_password_hash()` was updated to also strip `github_access_token` and
`github_oauth_state` from every user response.

**How to use**

- New users land on `/onboarding` after registration.
- CV upload accepts PDF/TXT/MD; stored in Supabase bucket `cvs` under `{user_id}/cv.{ext}`.
- GitHub connect (Profile page) starts the OAuth flow that stores `github_access_token`,
  `github_username`, `github_connected_at` on the `users` row.
- Both actions are optional; skipping them does not block program generation.

---

## ✅ Add multiple programs per user

**What was done**

Previously a user had exactly one program (unique constraint on `programs.user_id`). This
was relaxed so a user can generate new programs after completing (or abandoning) a prior one.
A new `MyPrograms.jsx` page lists all of the user's programs with status, progress, and a
"Start new program" button that re-runs the assessment-to-generation flow. `Assessment.jsx`
and the backend `POST /programs` endpoint were updated to handle multiple rows per user.
The achievements engine was also updated so badges accumulate across programs.

**How to use**

- After generating a program, users can navigate to `/programs` (listed in sidebar) to see
  all past and current programs.
- Starting a new program re-runs `POST /assessments` then `POST /programs`, creating a fresh
  program row without deleting history.
- Previous programs remain readable in history. Active program (the most recent non-abandoned
  one) is used by submission and current-task flows.

---

## ✅ See what's best from M-shifu and HyperSensei and merge them

**What was done**

M-shifu's best components were ported into HyperSensei:

- **`backend/simulate_check.py`** — a local test harness that runs the full
  evaluate-then-adapt loop against any task/submission pair without touching the database.
  Useful for prompt-tuning and regression testing without a live user account.
- **Program generator overhaul** (`program_generator.py`) — `generate_program()` was
  rewritten to ground generation in the learner's GitHub profile and known tools, produce
  structured day objects with explicit evaluation criteria, and call `adapt_next_day()` after
  each passing submission to personalize the following day.
- **CLI improvements** (`cli/hypersensei/main.py`) — `hypersensei check` and `hypersensei push`
  now report richer feedback; `hypersensei status` shows current day and score history.
- **Platform knowledge** (`platform_knowledge.py`) — the static context block injected into
  every LLM prompt was updated to reflect the merged feature set.

**How to use**

```bash
# Simulate evaluation + adaptation locally (no DB)
cd backend
python simulate_check.py   # reads task.json and a sample submission, prints score + adapted next-day
```

`simulate_check.py` is a standalone script — edit `task.json` and the hardcoded submission
text at the bottom to test any scenario without a running server.

---

## ✅ Add GitHub app to see changes done by user

**What was done**

A full GitHub integration was built across two phases:

**Phase 1 — Repo reading & submission** (`backend/github_reader.py`):
- `fetch_repo_text(owner, repo, subfolder, user_token)` walks the repo tree via the GitHub
  REST API (`/git/trees/{branch}?recursive=1`), skips binaries/lockfiles/venv dirs (same
  ignore rules as the `hypersensei` CLI), reads blobs up to 12 000 chars, and returns a
  single formatted text for the evaluator.
- `POST /programs/link-repo` stores `github_owner`, `github_repo`, `github_subfolder` on the
  program row. Requires a connected OAuth token.
- `POST /submissions/github` fetches the repo, evaluates it, and stores a `repo_summary` in
  `submission_feedback` as memory for future evaluations ("here's what existed before today's
  task"). The web `SubmitWork.jsx` is GitHub-only; the CLI `POST /submissions` (text/file) is
  unchanged.

**Phase 2 — Hardening**:
- Public-repo fallback removed — GitHub OAuth token is now required for all repo operations.
  Without it, `link-repo` and `submissions/github` return 400 with a clear message.
- Day 0 completion is gated on two conditions: GitHub account connected **and** a repo linked.
  The backend checks both before marking Day 0 complete; the frontend disables the button and
  shows a two-step checklist.

**How to use**

1. Connect GitHub on Profile page (OAuth flow).
2. On Day 0 (`/program/day/{id}`), paste the repo URL and click "Link repo".
3. From Day 1 onwards, `SubmitWork.jsx` shows the linked repo and a "Submit via GitHub" button
   — no copy-pasting code.
4. CLI users are unaffected: `hypersensei push` still calls `POST /submissions` (text/file).

**Key files**: `backend/github_reader.py`, `backend/api.py` (`/programs/link-repo`,
`/submissions/github`, `complete_setup_day`), `frontend/src/pages/SubmitWork.jsx`,
`frontend/src/pages/CurrentTask.jsx`.

---

## ✅ Add Auth (GitHub)

**What was done**

GitHub OAuth was extended from "connect an existing account" to also serve as a first-class
**login and signup** method. A single GitHub authorization now covers both identity and repo
access (`repo user:email` scope).

**Two OAuth contexts, one callback**:
- **Login/signup** (`GET /auth/github/login-start`, public): uses an HMAC-signed
  self-contained state (`ghlogin:{nonce}:{mac}`) — no DB row needed. On callback, the
  backend detects the `ghlogin:` prefix, verifies the HMAC, exchanges the code, fetches the
  user's GitHub profile + email, and calls `_find_or_create_github_user()`.
- **Connect** (`GET /auth/github/start`, requires JWT): existing flow — stores state in the
  user's `github_oauth_state` column, callback looks it up, attaches the token.

**Merge rule** (`_find_or_create_github_user`):
1. Look up by GitHub email → merge into existing account if found.
2. Look up by `github_username` → merge (handles reconnects).
3. Create a new social-only account (`password_hash = "!github_oauth"` sentinel).

After login, the backend issues our app JWT and redirects to
`{FRONTEND_URL}/auth/callback?token=JWT&new=bool`. `GitHubCallback.jsx` reads the token,
calls `loginWithToken()` in `AuthContext`, clears the token from the URL, and routes the
user to `/onboarding` (new) or `/dashboard` (returning).

Social-only accounts are blocked from password login with a clear message ("Use Sign in with
GitHub"). Regular password accounts are unaffected.

> **Note**: Google OAuth was scoped out — only GitHub login was implemented this sprint.

**How to use**

- "Sign in with GitHub" and "Sign up with GitHub" buttons on `/login` and `/register`.
- Users who authorized GitHub via Connect on Profile are already logged in and their token is
  already stored — no re-authorization needed.
- Env vars required: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`,
  `FRONTEND_URL`.

**Key files**: `backend/api.py` (`/auth/github/login-start`, `github_oauth_callback`,
`_find_or_create_github_user`), `frontend/src/pages/GitHubCallback.jsx`,
`frontend/src/context/AuthContext.jsx` (`loginWithToken`).

---

## ✅ Re-add precedents to add determinism (RAG)

**What was done**

Program generation is now grounded in **real, authored missions** from the Supabase
`missions` table (pgvector) instead of hand-written placeholder precedents.

**Pipeline**:
```
assessment → _build_query() → Gemini embed (768-dim) → match_missions RPC (pgvector cosine)
           → Python re-rank (semantic 60% + difficulty 25% + age 15%) → top-8 content docs
           → program_generator builds "ADAPT THESE REAL MISSIONS" grounding block → Groq
```

**Components built**:
- `backend/mission_retrieval.py` — `retrieve_missions(assessment)`: full pipeline, lazy
  clients, every failure returns `[]` (graceful fallback to `precedents.py`).
- `backend/ingest_missions.py` — one-off script; reads mission YAML, embeds with Gemini
  (`retrieval_document`), upserts into `missions` table. Run locally when missions change.
- `backend/program_generator.py` — `_mission_context()` calls retrieval; if non-empty,
  swaps the precedent block for a "REAL MISSIONS — ADAPT these" block. Fallback is silent.
- Supabase `match_missions` RPC (SQL) — cosine distance (`<=>`), optional `max_min_age`
  hard filter. ~130 rows → exact scan (no index needed).

**Age gating**: `min_age_band` is text (e.g. `band_15_17`). The leading number (15) is the
minimum age. A learner below it is excluded in both SQL and Python. Being above the band does
not gate.

**Config**:
```
USE_MISSION_RAG=true              # default; false → precedents fallback
GEMINI_API_KEY=...                # required; missing → fallback
MISSION_EMBED_MODEL=models/gemini-embedding-001  # must match ingest model
```

**Re-ingesting missions** (when YAML changes):
```bash
cd backend
python ingest_missions.py --dry-run   # parse + embed, no DB writes
python ingest_missions.py             # upsert into missions table
```

**Verified live** against the real ~130 missions:

| Learner | Avg difficulty tier | Behavior |
|---------|--------------------|----------|
| Advanced, age 30 (agents/RAG) | 2.75 (tiers 3–4) | RAG/agents missions, top-ranked |
| Beginner, age 16 (chatbots) | 1.62 (tiers 1–2) | simple chatbot/quiz missions |
| Under-age, 14 | — | 0 returned → precedents fallback |

Also verified: both prompt branches (output JSON schema unchanged), all fallback paths,
the age-band parser, and a live 768-dim embedding. The generation output schema, day model,
scoring, evaluation, CLI, and multi-program flow are untouched — only the prompt *input* changed.

**Remaining (nice-to-have)**: tuning re-ranking weights as the mission corpus grows.

---

## 🔄 Fix multiple AIs for different tasks (hard → Claude, easy → Ollama)

**What was done**

The routing **layer is fully implemented but shipped OFF** (`USE_MULTI_LLM=false`).
With the flag off, every LLM call goes to Groq with exactly the same parameters as
before — zero behavior change. Flipping one env var activates the split.

**Architecture** (`backend/llm_router.py`):
- `llm_router.chat(system, user, difficulty, temperature, json_mode)` — single uniform
  entry point; returns raw response text, callers keep their own JSON parsing +
  Pydantic validation.
- **Routing table** (when `USE_MULTI_LLM=true`):

| Task | Difficulty | Backend |
|------|-----------|---------|
| Program generation (`generate_program`) | hard | Claude (`claude-opus-4-8` via `anthropic` SDK) |
| Day adaptation (`adapt_next_day`, `generate_next_day`) | hard | Claude |
| Evaluation, day ≥ `COMPLEXITY_THRESHOLD_DAY` (default 8) | hard | Claude |
| Evaluation, day < threshold | easy | Ollama (OpenAI-compatible endpoint) |
| File analysis (`file_processor.py`) | easy | Ollama |
| HyperSensei chat / repo summaries (`api.py`) | — | stay on Groq (latency-sensitive, conversational) |

- **Fails closed**: any error in the chosen backend (missing `ANTHROPIC_API_KEY`,
  `anthropic` package not installed, Ollama not running, network error, Claude refusal)
  logs a warning and falls back to Groq — a misconfigured flag never breaks the platform.
- Clients are built lazily and cached; importing the module never opens a connection.
- Claude calls use adaptive thinking, no sampling params (rejected by `claude-opus-4-8`),
  and a JSON-extraction guard since Claude has no `response_format=json_object` mode.

**Wired call sites**: `evaluator.py` (difficulty from `day_number`),
`program_generator.py` (3 call sites, all hard), `file_processor.py` (easy).

**How to enable** (when ready to test):
```
pip install anthropic          # uncomment in requirements.txt
# in backend/.env:
USE_MULTI_LLM=true
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434/v1   # with `ollama serve` running
OLLAMA_MODEL=llama3.2
```

**Status**: Layer implemented, tested (import + routing logic + fallback), **disabled by
default**. Remaining: enable in a dev environment, A/B evaluation quality Claude vs Groq
on late-day submissions, and validate Ollama JSON reliability for `file_processor`.
