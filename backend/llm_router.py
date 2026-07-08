"""
LLM routing layer — pick a model backend per task difficulty.

OFF by default (USE_MULTI_LLM=false): every call goes to Groq with the exact
same parameters as before, so behavior is byte-for-byte unchanged.

When ON (USE_MULTI_LLM=true):
  hard  -> Anthropic Claude (program generation, day adaptation, evaluation of
           days >= COMPLEXITY_THRESHOLD_DAY)
  easy  -> local Ollama via its OpenAI-compatible endpoint (file analysis,
           evaluation of early days)
Any failure in the chosen backend (missing key, package not installed, network,
refusal) falls back to Groq, so a misconfigured flag never breaks the platform.

Clients are built lazily and cached; importing this module never constructs a
network client. `anthropic` is an optional dependency — only needed when the
flag is on (see requirements.txt).
"""

import os
import logging

logger = logging.getLogger("llm_router")

USE_MULTI_LLM = os.getenv("USE_MULTI_LLM", "false").lower() == "true"

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("Missing GROQ_API_KEY environment variable")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# Evaluations for day_number >= this count as "hard" (later days are more complex).
COMPLEXITY_THRESHOLD_DAY = int(os.getenv("COMPLEXITY_THRESHOLD_DAY", "8"))

_groq = None
_anthropic = None
_ollama = None


def _get_groq():
    global _groq
    if _groq is None:
        from openai import OpenAI
        _groq = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
    return _groq


def _get_anthropic():
    global _anthropic
    if _anthropic is None:
        import anthropic  # optional dep: only required when USE_MULTI_LLM=true
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        _anthropic = anthropic.Anthropic(api_key=api_key)
    return _anthropic


def _get_ollama():
    global _ollama
    if _ollama is None:
        from openai import OpenAI
        _ollama = OpenAI(api_key="ollama", base_url=OLLAMA_BASE_URL)
    return _ollama


def evaluation_difficulty(day_number) -> str:
    """Map a program day number to a routing difficulty."""
    try:
        return "hard" if int(day_number) >= COMPLEXITY_THRESHOLD_DAY else "easy"
    except (TypeError, ValueError):
        return "easy"


def _extract_json(text: str) -> str:
    """Best-effort: strip markdown fences / prose around a JSON object.
    Groq's json_object mode makes this a no-op; it matters for backends
    without a native JSON mode (Claude, some Ollama models)."""
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return text[start:end + 1]
    return text


def _openai_style_chat(client, model, system, user, temperature, json_mode):
    kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        **kwargs,
    )
    return response.choices[0].message.content or ""


def _claude_chat(system, user, json_mode, max_tokens):
    client = _get_anthropic()
    # claude-opus-4-8 rejects sampling params (temperature/top_p) — do not send them.
    # Adaptive thinking must be requested explicitly on Opus 4.7/4.8.
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined the request (stop_reason=refusal)")
    text = "".join(block.text for block in response.content if block.type == "text")
    return _extract_json(text) if json_mode else text


def chat(
    system: str,
    user: str,
    difficulty: str = "easy",
    temperature: float = 0.3,
    json_mode: bool = True,
    max_tokens: int = 16000,
) -> str:
    """
    Route a single system+user completion to the right backend and return the
    raw response text. Callers keep their own JSON parsing and validation.
    """
    if USE_MULTI_LLM:
        try:
            if difficulty == "hard":
                return _claude_chat(system, user, json_mode, max_tokens)
            text = _openai_style_chat(
                _get_ollama(), OLLAMA_MODEL, system, user, temperature, json_mode
            )
            return _extract_json(text) if json_mode else text
        except Exception as e:
            logger.warning(
                "multi-LLM backend failed (difficulty=%s): %r — falling back to Groq",
                difficulty, e,
            )

    return _openai_style_chat(_get_groq(), GROQ_MODEL, system, user, temperature, json_mode)
