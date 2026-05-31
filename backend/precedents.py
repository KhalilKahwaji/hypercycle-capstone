"""
Precedent programs used as few-shot examples for program generation.

These give the LLM a sense of what a *good* 15-day program looks like:
spec-driven, each day ending in a shippable, building on the previous day.

If you enable the optional RAG bonus (see rag_store.py), these same texts
get embedded and retrieved instead of being dumped wholesale into the prompt.
"""

HYPERCYCLE_PRECEDENT = """
HyperCycle 15-Day Advanced Sprint (MarkCoffee).
Philosophy: each day starts with a Spec and ends with a Shippable.
Phase 1 (Days 1-4) - new tools: Groq+Ollama dual-brain CLI; CrewAI multi-agent
startup validator; Supabase backend with users/submissions/storage; FastAPI REST API.
Phase 2 (Days 5-9) - intermediate: ChromaDB RAG pipeline with Ollama embeddings;
LangGraph research assistant with conditional retry loops; universal file analyzer
with pdfplumber + Groq structured extraction; Streamlit+FastAPI full-stack app;
production hardening with JWT auth, rate limiting, structured logging, sanitization.
Phase 3 (Days 10-15) - capstone: deploy a real full-stack AI product.
Each day: 1hr research, a clear spec, concrete tasks, one shippable deliverable.
"""

N8N_PRECEDENT = """
Prior n8n automation program. Focused on no-code/low-code workflow automation:
connecting APIs, webhooks, scheduled triggers, data transformation nodes, and
chaining third-party services. Emphasis on building working automations daily
and understanding event-driven flows before moving to code-heavy AI work.
"""

ELIAS_PRECEDENT = """
Elias's program. A more fundamentals-first track for someone newer to programming:
Python basics, working with APIs, simple scripting, then gradually layering in
LLM calls and small projects. Slower ramp, heavier scaffolding early, with each
day still ending in something runnable.
"""

ALL_PRECEDENTS = [HYPERCYCLE_PRECEDENT, N8N_PRECEDENT, ELIAS_PRECEDENT]


def precedents_block() -> str:
    """Joined precedent text for direct inclusion in the generation prompt."""
    return "\n\n".join(p.strip() for p in ALL_PRECEDENTS)
