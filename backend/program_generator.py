"""
Program generation.
Takes a user's self-assessment and produces a personalized 16-day program
(Day 0 through Day 15) as structured JSON, using precedent programs as weak
structural inspiration only.

Optional RAG: if USE_RAG=true and rag_store is importable, retrieve the most
relevant precedent chunks instead of dumping all precedents.
"""

import json
import os
from typing import List

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

from precedents import precedents_block

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("Missing GROQ_API_KEY environment variable")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
USE_RAG = os.getenv("USE_RAG", "false").lower() == "true"

_client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")


class GeneratedDay(BaseModel):
    day_number: int = Field(..., ge=0, le=15)
    title: str
    objective: str
    research_topics: List[str] = Field(default_factory=list)
    task_description: str
    expected_output: str
    evaluation_criteria: str
    estimated_hours: float = Field(..., ge=0)
    unlock_condition: str


class GeneratedProgram(BaseModel):
    title: str
    summary: str
    days: List[GeneratedDay]


def _precedent_context(assessment: dict) -> str:
    if USE_RAG:
        try:
            from rag_store import retrieve_precedents  # optional bonus
            query = f"{assessment.get('goals','')} {assessment.get('known_languages','')} {assessment.get('experience_level','')}"
            return retrieve_precedents(query)
        except Exception:
            pass  # fall back to inline precedents
    return precedents_block()


SYSTEM_PROMPT = (
    "You are an expert AI-development curriculum designer. You create personalized, "
    "spec-driven 16-day learning programs (Day 0 through Day 15). "
    "Day 0 is always an environment and setup day. Days 1-15 are progressively harder "
    "learning days, each starting with a clear spec and ending with a concrete shippable deliverable. "
    "You return STRICT JSON only. No markdown, no commentary."
)


def build_user_prompt(assessment: dict, precedent_context: str, username: str = "learner") -> str:
    age = assessment.get("age", "")
    age_line = f"- Age: {age}" if age else ""
    age_pacing = (
        f"- Consider {username}'s age ({age}) for pacing and tone: younger learners benefit "
        f"from more scaffolding and encouragement; older/professional learners prefer direct, "
        f"concise framing."
        if age else ""
    )
    age_address = " and age" if age else ""
    return f"""
Design a personalized 16-day AI-development learning program for {username}.

LEARNER PROFILE:
- Username: {username}
- Known languages / tools: {assessment.get('known_languages', 'unknown')}
- Experience level: {assessment.get('experience_level', 'unknown')}
- Goals: {assessment.get('goals', 'unknown')}
- Background: {assessment.get('background', 'unknown')}
- Hours available per week: {assessment.get('hours_per_week', 'unknown')}
{age_line}

PRECEDENT PROGRAMS — LOOSE structural inspiration ONLY. DO NOT copy their topics or structure:
{precedent_context}
The precedents above exist solely to show what a well-formed day looks like (spec + shippable deliverable).
Prioritize {username}'s goals, level{age_address} above all else. Do NOT replicate any precedent's topic
sequence, tool choices, or phase structure.

REQUIREMENTS:
1. Address {username} directly in second person throughout ALL text fields ("You will build...",
   "Your goal today is...", "You should now have..."). NEVER write "the learner", "the student",
   or any third-person phrasing. Every field — objective, task_description, expected_output,
   evaluation_criteria — must speak directly to {username}.
2. Tailor the entire program to THIS specific learner. Reflect their stated goals and known
   tools directly in day titles and tasks. A beginner gets fundamentals first with heavy
   scaffolding; an advanced learner gets harder tasks and faster ramps.
{age_pacing}
3. Exactly 16 days, day_number 0 through 15.
4. DAY 0 MUST be an environment and setup day. It must cover:
   - Creating a GitHub account (if needed) and initializing the project repository
   - Installing every tool, library, and dependency this program will require
   - Obtaining all required API keys (list each one explicitly)
   - Setting up .gitignore (exclude .env, __pycache__, node_modules, etc.)
   - Preparing the project folder structure as a scaffold for the entire program
   The research_topics for Day 0 MUST list every specific tool, library, or service the
   learner needs to install or register for (e.g. ["Python 3.11", "FastAPI", "Git", "Groq API key"]).
5. Days 1-15 are learning and building days that increase in difficulty progressively.
   Day 15 must be a capstone or deployment day that synthesizes everything built previously.
6. Each day's research_topics MUST be an array of specific tool and library names relevant
   to THAT day's work (e.g. ["FastAPI", "Pydantic", "uvicorn"]). Generic strings like
   "documentation" or "AI concepts" are not acceptable — name the actual tools.
7. Each day's evaluation_criteria MUST be a numbered list of exactly 3-5 concrete, measurable
   checks that a reviewer can verify as pass/fail. A single vague sentence is not acceptable.
   Good example: "1. GitHub repo initialized with .gitignore committed. 2. All dependencies
   install without errors via pip install -r requirements.txt. 3. Project folder matches the
   specified structure. 4. .env is excluded from git history."
8. estimated_hours must be realistic given the learner's hours_per_week.

Return JSON in EXACTLY this shape:
{{
  "title": "short program title referencing {username}'s goal",
  "summary": "2-3 sentences addressing {username} directly about what they will build and learn",
  "days": [
    {{
      "day_number": 0,
      "title": "Environment Setup & Toolbox",
      "objective": "what {username} will have set up and ready by the end of this day",
      "research_topics": ["GitHub", "Python 3.11", "Git", "Groq API", "specific-tool-N"],
      "task_description": "step-by-step setup tasks written directly to {username}",
      "expected_output": "a committed GitHub repo with working environment and all dependencies installed",
      "evaluation_criteria": "1. specific verifiable check. 2. specific verifiable check. 3. specific verifiable check.",
      "estimated_hours": 3,
      "unlock_condition": "Starting day — always unlocked."
    }},
    {{
      "day_number": 1,
      "title": "...",
      "objective": "what {username} will be able to do after this day",
      "research_topics": ["specific-lib-1", "specific-lib-2", "specific-lib-3"],
      "task_description": "concrete spec written directly to {username}",
      "expected_output": "the shippable deliverable {username} must produce",
      "evaluation_criteria": "1. check one. 2. check two. 3. check three. 4. check four.",
      "estimated_hours": 5,
      "unlock_condition": "Complete Day 0."
    }}
  ]
}}

Rules:
- Output all 16 days (day_number 0 through 15). Missing any day is an error.
- estimated_hours is a number (not a string).
- research_topics is an array of specific named tools/libraries — no generic descriptions.
- evaluation_criteria is a numbered list of 3-5 concrete, verifiable checks.
- No text outside the JSON object.
"""


class AdaptedDay(BaseModel):
    """Same fields as GeneratedDay but no day_number — used for the adaptation response."""
    title: str
    objective: str
    research_topics: List[str] = Field(default_factory=list)
    task_description: str
    expected_output: str
    evaluation_criteria: str
    estimated_hours: float = Field(..., ge=0)
    unlock_condition: str


def adapt_next_day(
    program_title: str,
    program_summary: str,
    next_day_current: dict,
    prev_day: dict,
    prev_submission_text: str,
    prev_feedback: dict,
    username: str = "learner",
) -> dict:
    """
    Refine the next day's content based on how the user actually performed.
    Returns a dict matching AdaptedDay fields (no day_number).
    Raises ValueError on invalid/unparseable model output.
    """
    score = prev_feedback.get("score", "?")
    passed = prev_feedback.get("passed", True)
    feedback_summary = prev_feedback.get("summary", "")
    strengths = prev_feedback.get("strengths", [])
    issues = prev_feedback.get("issues", [])
    required_fixes = prev_feedback.get("required_fixes", [])

    def _bullets(items):
        return "\n".join(f"- {x}" for x in items) if items else "None."

    prompt = f"""You are refining an upcoming day in {username}'s personalized AI-development program.

PROGRAM: {program_title}
{program_summary}

PREVIOUS DAY (just completed by {username}):
- Day {prev_day.get('day_number')}: {prev_day.get('title')}
- Objective: {prev_day.get('objective')}

EVALUATION RESULT (score {score}/10, {'PASSED' if passed else 'FAILED'}):
{feedback_summary}
Strengths:
{_bullets(strengths)}
Issues:
{_bullets(issues)}
Required fixes:
{_bullets(required_fixes)}

SUBMISSION EXCERPT ({username}'s actual work, first 800 chars):
{prev_submission_text[:800]}

CURRENTLY PLANNED NEXT DAY (Day {next_day_current.get('day_number')}):
Title: {next_day_current.get('title')}
Objective: {next_day_current.get('objective')}
Task: {next_day_current.get('task_description')}
Expected output: {next_day_current.get('expected_output')}
Evaluation criteria: {next_day_current.get('evaluation_criteria')}
Research topics: {next_day_current.get('research_topics')}
Estimated hours: {next_day_current.get('estimated_hours')}
Unlock condition: {next_day_current.get('unlock_condition')}

INSTRUCTIONS:
Refine — do NOT replace — the planned next day for {username}. Keep it on the same topic and in the same sequence position. Adjust it based on their actual performance:
- If they struggled (low score, multiple issues): add more scaffolding, reduce scope, explicitly address weak points.
- If they excelled (high score, few issues): add a small stretch challenge or remove unnecessary hand-holding.
- Keep day_number {next_day_current.get('day_number')} unchanged (do not include it in the response).
- Address {username} in second person throughout all fields.
- research_topics must list specific tool/library names.
- evaluation_criteria must be a numbered list of 3-5 concrete, verifiable checks.

Return JSON in EXACTLY this shape (no day_number field):
{{
  "title": "...",
  "objective": "what {username} will be able to do after this day",
  "research_topics": ["specific-tool-1", "specific-lib-2"],
  "task_description": "concrete spec written directly to {username}",
  "expected_output": "the shippable deliverable",
  "evaluation_criteria": "1. check. 2. check. 3. check.",
  "estimated_hours": 5,
  "unlock_condition": "..."
}}

No text outside the JSON object.
"""

    response = _client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": (
                "You are an expert AI-development curriculum designer. "
                "You return STRICT JSON only. No markdown, no commentary."
            )},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Adaptation returned invalid JSON: {content}") from e

    try:
        adapted = AdaptedDay.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Adapted day failed validation: {e}") from e

    return adapted.model_dump()


def generate_program(assessment: dict, username: str = "learner") -> GeneratedProgram:
    precedent_context = _precedent_context(assessment)
    user_prompt = build_user_prompt(assessment, precedent_context, username=username)

    response = _client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.6,  # some variety so programs differ per person
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Program generation returned invalid JSON: {content}") from e

    try:
        program = GeneratedProgram.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Program failed validation: {e}") from e

    if len(program.days) != 16:
        raise ValueError(f"Expected 16 days, got {len(program.days)}")

    return program
