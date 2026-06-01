"""
Precedent programs used as guidance for program generation.
 
The LLM reads these to learn what a GOOD program looks like - its structure,
flow, pacing, and how each day builds on the last - then generates a new program
tailored to the specific learner. Having several DIFFERENT programs (advanced vs
beginner, product-building vs infrastructure vs automation) is what lets the model
match a learner's level and goals to the right shape, instead of one template.
 
If the optional RAG bonus is enabled (USE_RAG=true), these texts get embedded and
the most relevant ones are retrieved per learner instead of inlining all four.
With four full programs the combined text is large, so enabling USE_RAG is the
recommended way to keep the generation prompt within the context window.
"""
 
# 1. Advanced, product-building full-stack sprint (MarkCoffee's HyperCycle).
HYPERCYCLE_PRECEDENT = """
PROGRAM: HyperCycle - 15-Day Advanced Sprint (by MarkCoffee). LEVEL: advanced.
SCHEDULE: 4-5 days/week, 5 hrs/day. PHILOSOPHY: each day starts with a Spec and
ends with a Shippable. For someone who already builds agents/workflows and now
learns to build and DEPLOY full-stack AI PRODUCTS. Three phases that build up.
PHASE 1 - New tools (Days 1-4): D1 Groq+Ollama "Dual Brain" CLI (async, JSON mode);
D2 CrewAI "Startup Idea Validator" (Ideator->Critic->Pitcher); D3 Supabase backend
(users/submissions, RLS, storage, progress fn); D4 FastAPI REST API wrapping it
(register/submissions/progress, Pydantic, 409 dupes, CORS).
PHASE 2 - Intermediate (Days 5-9): D5 ChromaDB RAG "Smart Document Search" (chunk,
Ollama embeddings, top-3 + Groq grounded answer); D6 LangGraph "Research Assistant"
(planner/researcher/evaluator/writer, confidence loop); D7 "Universal File Analyzer"
(pdfplumber + Groq structured extraction, POST /analyze, edge cases); D8 Streamlit+
FastAPI full-stack dry run; D9 production hardening (JWT, logging, rate limit,
sanitization, /health, load test).
PHASE 3 - Capstone (Days 10-15): open-ended; combine everything into a deployed
full-stack AI product. GRADING: works end-to-end 30%, code quality 20%, AI
integration 20%, UI/UX 15%, docs+demo 15%.
STRUCTURAL LESSONS: spec+shippable daily; progressive reuse; phased difficulty;
~1hr research per day; open capstone that synthesizes all prior days.
"""
 
# 2. Beginner-to-intermediate Python -> ML -> AI agents track (Elias).
ELIAS_PRECEDENT = """
PROGRAM: AI Agents Curriculum - 15 Days, Python + ML + AI Agents (intern: Elias,
supervisor: MarkCoffee). LEVEL: beginner-to-intermediate, self-learning with support.
Heavier scaffolding and a slower ramp than HyperCycle. Daily: document work in a
Google Doc + push code to GitHub; weekly PDF submissions; final capstone presentation.
PHASE 1 - Python Foundations (Days 1-4): D1 environment + Python basics (lists,
dicts, functions, file I/O, first Groq call); D2 classes + error handling + loguru
logging (DataProcessor class); D3 working with APIs (requests, Open-Meteo, WeatherFetcher);
D4 LLM basics + first CLI chatbot (temperature, conversation history, /commands).
PHASE 2 - ML / Data Science (Days 5-9): D5 pandas (load/filter/groupby, DataCleaner);
D6 visualization (matplotlib/seaborn); D7 sklearn models (train/test, regression,
metrics, PredictionPipeline); D8 feature engineering + tuning (scaling, GridSearchCV);
D9 Streamlit to deploy the model (joblib, upload + predict).
PHASE 3 - AI Agents (Days 10-15): D10 prompt engineering (personas, few-shot, CoT);
D11 tool use / function calling (calculator + weather tools); D12 RAG (embeddings,
FAISS/ChromaDB, DocumentQA); D13 LangChain basics (chains, memory, ResearchHelper);
D14 multi-agent intro (Researcher->Writer, ContentCreator); D15 capstone (choose:
ML+chat, data analysis+LLM summary, RAG assistant, or own idea) with Streamlit demo,
README, requirements.txt, and a live presentation.
STRUCTURAL LESSONS: start from fundamentals and layer up; each day still ends in
something runnable; explicit documentation habit; capstone offers guided options
rather than fully open-ended; paced for someone newer to programming.
"""
 
# 3. Infrastructure / Docker / Node + AIM engineering track (HyperPG).
HYPERPG_PRECEDENT = """
PROGRAM: HyperPG Node & AIM Engineering - 15-Day Task-Based Curriculum. LEVEL:
intermediate, infrastructure/devops-focused. Local-first development with optional
cloud (AWS) deployment. Daily tasks, code commits, end-of-day check-in, and explicit
"Checkpoint Questions" to test understanding. Each day has Required Reading, Tasks,
Deliverables, and verification commands.
WEEK 1 - Core Node & AIM fundamentals (local): D1 environment setup (Docker, Git/SSH,
Python, clone repo, docker run hello-world); D2 Node architecture & launch (diagram
router/runtime/AIM/logs, run node locally, read logs); D3 deploy a prebuilt AIM
(docker pull, manifest.json, /health check); D4 build & deploy your own AIM (main.py
POST /run, Dockerfile, build image, deploy via manifest); D5 resource limits + health
checks (CPU_SHARES, mem_limit, break AIM, observe recovery).
WEEK 2 - Pipelines & multi-AIM workflows (+ optional AWS): D6 file-processor AIM
(upload, return JSON line/word counts, handle empty/large files); D7 AIM-to-AIM
communication (chain AIM1->AIM2, internal routing, log lifecycle); D8 summarizer AIM
with LLM integration (Groq/Ollama/OpenAI, fallback); D9 optional AWS EC2 node deploy;
D10 cloud pipeline deployment (push images, deploy 3-AIM pipeline publicly).
WEEK 3 - Production, debugging & mastery: D11 logging & monitoring (load test with ab,
annotate errors); D12 security hardening (API key auth, rate limiting, request size);
D13 UI integration (web UI / WhatsApp bot / CLI); D14 performance (profile cold starts,
caching, reduce latency); D15 capstone checkpoint (working pipeline, README, 5-min demo).
STRUCTURAL LESSONS: task-based with verification commands and checkpoint questions;
local-first then optional cloud; heavy on containers, health checks, and resilience;
strong production/ops emphasis distinct from app-building tracks.
"""
 
# 4. n8n-first automation -> Python -> RAG track (Khalil's earlier program).
N8N_PRECEDENT = """
PROGRAM: Khalil's Program - n8n-first agent development. LEVEL: intermediate.
SCHEDULE: 4 days/week, 5 hrs/day. PHILOSOPHY: each day starts with a Spec
(Requirement) and ends with a Shippable (Working Agent). Begins Day Zero with a
"toolbox" survey of ~20 tools (orchestration, LLMs, frameworks, vector DBs, utilities).
WEEK 1 - The "Game Engine" (n8n mastery, think in flows not code): D1 setup + Hello
World agent (webhook -> Switch node routing -> HTTP POST / CSV transform); D2 brain
integration (LLM sentiment analyzer with strict JSON output + JSON Parse guardrail);
D3 JavaScript Code node (clean messy nested API data without visual helpers); D4 API
chaining + error handling (resilient scraper: retry loop, alert to Discord/Slack).
WEEK 2 - The "Brain" (Python & LLM logic, harder than n8n can do): D1 raw API CLI
chatbot (system prompt persona, conversation history); D2 structured data with Pydantic
(text -> typed Job model); D3 tool use / function calling (Math/weather agent); D4 the
agent loop (while-True research looper chaining searches to an answer).
WEEK 3 - Advanced Memory (RAG) & production: D1 embeddings & vector DBs (cosine
similarity, semantic search); D2 RAG pipeline (PDF chatbot with Supabase pgvector);
D3 multi-agent orchestration (n8n Planner + Python Writer + n8n Editor grading loop);
D4 capstone "Freelance Ready" project (Google Sheet trigger -> scrape -> news ->
personalized email draft to Gmail).
STRUCTURAL LESSONS: starts no-code/low-code (n8n) before hard code; emphasizes
guardrails and error/retry loops; progresses orchestration -> Python logic -> RAG ->
production automation; capstone is a practical end-to-end automation.
"""
 
ALL_PRECEDENTS = [
    HYPERCYCLE_PRECEDENT,
    ELIAS_PRECEDENT,
    HYPERPG_PRECEDENT,
    N8N_PRECEDENT,
]
 
 
def precedents_block() -> str:
    """Joined precedent text for direct inclusion in the generation prompt."""
    return "\n\n".join(p.strip() for p in ALL_PRECEDENTS)
 
