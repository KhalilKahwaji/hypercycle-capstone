"""
Mission retrieval for RAG-grounded program generation.

Instead of generating a program from scratch with inlined precedents, we RETRIEVE
the most relevant real, authored missions from the Supabase `missions` table
(pgvector) for a given learner, and feed those missions to the generator as the
deterministic basis to ADAPT into the program's days.

Pipeline:
  assessment -> query string -> Gemini embedding (768-dim) -> pgvector similarity
  search (match_missions RPC) -> weighted re-rank (similarity + difficulty + age)
  -> top-N mission `content` docs.

Both the Gemini client and the Supabase client are built LAZILY (on first use,
cached) so that importing this module never fails and a missing GEMINI_API_KEY,
a missing google-generativeai package, or DB trouble degrades gracefully: every
public function fails closed by returning nothing, and the caller
(program_generator) falls back to precedents.py so generation never hard-fails.

IMPORTANT — embedding-model consistency:
  Query embeddings MUST come from the SAME model that produced the stored mission
  embeddings, or cosine similarity is meaningless. The committed ingest_missions.py
  used `models/gemini-embedding-001` at 768 dims with task_type="retrieval_document";
  we query with the same model and task_type="retrieval_query". If your missions
  table was actually populated with a different model, override MISSION_EMBED_MODEL.
"""

import os
import re
import json
import logging
from typing import List, Optional

logger = logging.getLogger("mission_retrieval")

# Embedding config. Must match how the missions table was ingested (see module
# docstring). Overridable so retrieval can track whatever model populated the DB.
EMBED_MODEL = os.getenv("MISSION_EMBED_MODEL", "models/gemini-embedding-001")
EXPECTED_DIM = 768

# How many nearest neighbours to pull from pgvector before Python re-ranking, and
# how many adapted-basis missions to ultimately hand the generator.
CANDIDATE_POOL = 30
DEFAULT_TOP_N = 8

# Re-ranking weights. Final score = blend of three normalized [0,1] components.
#   semantic   (0.60) — cosine similarity of the learner query to the mission.
#   difficulty (0.25) — how close the mission's tier is to the learner's target
#                       tier (beginner->~1.5, intermediate->~2.5, advanced->~3.5).
#   age        (0.15) — credit for clearing the age gate. Age's PRIMARY role is a
#                       HARD FILTER (a mission whose min_age_band exceeds the
#                       learner's age is excluded outright, below), so survivors
#                       all score 1.0 here; the weight keeps the blend summing to
#                       1.0 and leaves room to make this term smarter later.
# Tune freely; they intentionally sum to 1.0.
W_SEMANTIC = 0.60
W_DIFFICULTY = 0.25
W_AGE = 0.15

_genai = None
_supabase = None


def _get_genai():
    """Lazily import + configure google-generativeai. Cached. Raises on misconfig."""
    global _genai
    if _genai is None:
        import google.generativeai as genai  # lazy: keeps the dep optional
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        _genai = genai
    return _genai


def _get_supabase():
    """Lazily build a Supabase client from env. Cached. Raises on misconfig."""
    global _supabase
    if _supabase is None:
        from supabase import create_client  # lazy
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        _supabase = create_client(url, key)
    return _supabase


def embed_query(text: str) -> List[float]:
    """
    Embed a query string at 768 dims via Gemini, using task_type "retrieval_query"
    (the ingest used "retrieval_document"). Tries output_dimensionality first and
    falls back to the older/native signature on any rejection, matching ingest.
    """
    genai = _get_genai()
    try:
        resp = genai.embed_content(
            model=EMBED_MODEL,
            content=text,
            task_type="retrieval_query",
            output_dimensionality=EXPECTED_DIM,
        )
    except Exception:
        # Older client signature, or a model that fixes its own dimensionality.
        resp = genai.embed_content(
            model=EMBED_MODEL,
            content=text,
            task_type="retrieval_query",
        )
    return resp["embedding"]


def _coerce_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_min_age(band) -> Optional[int]:
    """Extract the minimum age from a text band label, e.g. 'band_15_17' -> 15.
    Returns None when there is no numeric component (treated as no age gate)."""
    if band is None:
        return None
    match = re.search(r"\d+", str(band))
    return int(match.group()) if match else None


def _target_tier(experience_level: Optional[str]) -> float:
    """Map a free-text experience level to a target difficulty tier midpoint.
    beginner -> 1-2 (1.5), intermediate -> 2-3 (2.5), advanced -> 3-4 (3.5)."""
    s = (experience_level or "").lower()
    if any(k in s for k in ("advanc", "expert", "senior", "pro")):
        return 3.5
    if "interm" in s:
        return 2.5
    if any(k in s for k in ("begin", "novice", "new", "starter", "none", "no exp")):
        return 1.5
    return 2.5  # default: assume intermediate when unknown


def _difficulty_fit(tier: Optional[int], target: float) -> float:
    """1.0 when the mission tier equals the target; decays with distance.
    Normalized by the full tier span (4-1=3) so it stays in [0,1]."""
    if tier is None:
        return 0.5
    return max(0.0, 1.0 - abs(float(tier) - target) / 3.0)


def _build_query(assessment: dict) -> str:
    """Build a natural-language retrieval query from whatever assessment fields exist."""
    fields = [
        ("Goals", assessment.get("goals")),
        ("Wants to build / focus on", assessment.get("focus_area")),
        ("Success looks like", assessment.get("target_outcome")),
        ("Known languages and tools", assessment.get("known_languages")),
        ("Experience level", assessment.get("experience_level")),
        ("Background", assessment.get("background")),
        ("Additional notes", assessment.get("prior_experience_notes")),
    ]
    parts = [f"{label}: {str(value).strip()}" for label, value in fields
             if value and str(value).strip()]
    return "\n".join(parts)[:4000]


def retrieve_missions(assessment: dict, top_n: int = DEFAULT_TOP_N) -> List[dict]:
    """
    Return up to `top_n` full mission `content` dicts (best first) for this learner,
    or [] on any failure / no matches (so the caller falls back to precedents).

    Combines pgvector cosine similarity with a difficulty-fit and an age gate:
    a mission whose min_age_band exceeds the learner's age is EXCLUDED entirely.
    """
    try:
        query = _build_query(assessment)
        if not query.strip():
            return []

        vector = embed_query(query)
        age = _coerce_int(assessment.get("age"))

        sb = _get_supabase()
        resp = sb.rpc(
            "match_missions",
            {
                "query_embedding": vector,
                "match_count": CANDIDATE_POOL,
                # None -> SQL skips age filtering; the Python gate below still applies.
                "max_min_age": age,
            },
        ).execute()
        rows = getattr(resp, "data", None) or []
        if not rows:
            return []

        target = _target_tier(assessment.get("experience_level"))
        scored = []
        for r in rows:
            content = r.get("content")
            if not isinstance(content, dict):
                continue

            min_age = _parse_min_age(r.get("min_age_band"))
            # HARD age filter: below a mission's min age band -> exclude entirely.
            if age is not None and min_age is not None and age < min_age:
                continue

            similarity = float(r.get("similarity") or 0.0)
            difficulty = _difficulty_fit(_coerce_int(r.get("difficulty_tier")), target)
            age_fit = 1.0  # survivors cleared the gate; see weight comment above.

            score = (W_SEMANTIC * similarity
                     + W_DIFFICULTY * difficulty
                     + W_AGE * age_fit)
            scored.append((score, content))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        result = [content for _, content in scored[:top_n]]
        logger.info(json.dumps({
            "event": "mission_retrieval",
            "candidates": len(rows),
            "returned": len(result),
            "model": EMBED_MODEL,
        }))
        return result

    except Exception as e:
        logger.warning(json.dumps({
            "event": "mission_retrieval_failed",
            "error": repr(e),
        }))
        return []
