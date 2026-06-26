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


def _age_rules(age, username: str) -> str:
    """Return a concrete AGE RULES block to inject into the prompt, or empty string."""
    try:
        age = int(age)
    except (TypeError, ValueError):
        return ""

    if age < 16:
        return f"""\
AGE RULES (strictly enforced — {username} is {age} years old):
- Cap estimated_hours at 2.0 for every single day, no exceptions.
- Use warm, encouraging language throughout. Celebrate small wins explicitly.
- Provide the heaviest possible scaffolding: break every task into numbered sub-steps,
  explain the purpose of each tool before asking {username} to use it.
- Avoid jargon without defining it. If you use a term like "environment variable" or
  "endpoint", explain it in plain language in the same sentence.
- Keep scope small per day — one concept or one feature per day maximum."""

    if age <= 18:
        return f"""\
AGE RULES (strictly enforced — {username} is {age} years old):
- Cap estimated_hours at 3.0 for every single day.
- Use encouraging, upbeat language. Acknowledge that balancing school and coding is hard.
- Provide heavy scaffolding: number every sub-step in task_description, explain the "why"
  behind each tool choice in one sentence.
- Avoid dense jargon; define technical terms inline on first use.
- Keep each day's scope tight — one primary deliverable per day."""

    if age <= 24:
        return f"""\
AGE RULES ({username} is {age} years old — student or early-career):
- estimated_hours up to 5.0 per day is acceptable; scale to hours_per_week.
- Use direct, peer-level language — treat {username} as capable but still learning.
- Provide moderate scaffolding: name the files and functions explicitly, but do not
  explain basic concepts like what a function is.
- task_description should include "why" for non-obvious design decisions.
- Scope can expand steadily across days; push toward independence by Day 10+."""

    if age <= 35:
        return f"""\
AGE RULES ({username} is {age} years old — early-to-mid career professional):
- estimated_hours up to 5.0 per day is fine; respect that {username} has professional
  commitments and keep total program load realistic.
- Use direct, professional spec language — no hand-holding, no unnecessary encouragement.
- Scaffolding should be specification-level only: name files, functions, endpoints, and
  expected behavior. Do not explain fundamentals unless directly relevant to the task.
- Assume {username} can look up docs independently; point to specific APIs, not concepts.
- Complexity can ramp quickly; reach advanced topics by Day 5-6."""

    if age <= 50:
        return f"""\
AGE RULES ({username} is {age} years old — mid-to-senior career professional):
- Cap estimated_hours at 4.0 per day — {username} has significant professional and
  personal commitments; overloading sessions leads to drop-off.
- Use concise, efficiency-focused language. Every sentence in task_description must
  earn its place. No filler, no motivational padding.
- Zero scaffolding for general programming concepts — assume strong fundamentals.
  Focus spec detail only on the specific APIs, tools, or patterns that are genuinely new.
- Respect {username}'s existing experience: avoid re-explaining things a senior dev knows.
- Complexity should start high and stay high; treat Days 1-3 as a fast ramp-up."""

    # age > 50
    return f"""\
AGE RULES ({username} is {age} years old):
- Cap estimated_hours at 3.5 per day — prioritize depth over breadth; fewer, higher-quality
  sessions beat a dense daily grind.
- Use respectful, collegial language. No motivational hype; treat {username} as an experienced
  professional picking up new tools.
- Assume strong professional fundamentals. Explain only what is genuinely novel (new APIs,
  new paradigms). Never explain general software concepts.
- Keep task_description precise and scannable — {username} values clarity over verbosity.
- Build in explicit reflection moments: "By the end of this day you will understand exactly
  how X works and why it is used here" — connect new tools to existing mental models."""


def _optional_enrichment_block(assessment: dict) -> str:
    """Build an ADDITIONAL CONTEXT section from optional onboarding fields, or return ''."""
    parts = []

    cv_text = (assessment.get("cv_text") or "").strip()
    if cv_text:
        parts.append(f"CV / Resume (use to calibrate actual skill level — takes priority over stated level):\n{cv_text[:2000]}")

    github_summary = (assessment.get("github_summary") or "").strip()
    if github_summary:
        parts.append(f"GitHub: {github_summary}")

    learning_style = (assessment.get("preferred_learning_style") or "").strip()
    if learning_style:
        parts.append(f"Preferred learning style: {learning_style}")

    focus_area = (assessment.get("focus_area") or "").strip()
    if focus_area:
        parts.append(f"What they most want to build/focus on: {focus_area}")

    target_outcome = (assessment.get("target_outcome") or "").strip()
    if target_outcome:
        parts.append(f"What success looks like for them: {target_outcome}")

    experience_notes = (assessment.get("prior_experience_notes") or "").strip()
    if experience_notes:
        parts.append(f"Additional background notes: {experience_notes}")

    if not parts:
        return ""

    return (
        "\nADDITIONAL CONTEXT — use these to calibrate difficulty and tailor topics. "
        "Where they conflict with the stated experience level, prefer this richer signal:\n"
        + "\n".join(parts)
        + "\n"
    )


def build_user_prompt(assessment: dict, precedent_context: str, username: str = "learner") -> str:
    age = assessment.get("age", "")
    age_line = f"- Age: {age}" if age else ""
    age_block = _age_rules(age, username)
    age_address = " and age" if age else ""
    enrichment_block = _optional_enrichment_block(assessment)
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
{enrichment_block}

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
{age_block}
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
7. task_description MUST be a detailed, step-by-step specification of at least 5-8 sentences.
   It MUST include ALL of the following:
   (a) the exact file(s) to create and their names,
   (b) specific functions or classes to implement, named explicitly (e.g. "define a function
       called generate_response(user_input: str) -> str"),
   (c) exact required behaviors — what inputs the code accepts, what it returns or outputs,
   (d) any configuration, environment variables, or library calls required for that day,
   (e) any API endpoints, routes, or UI elements to build, with their exact paths and payloads.
   A one-sentence or two-sentence task_description is a FAILURE. Write it like a real engineer's
   ticket — specific enough that {username} knows exactly what to build without guessing.
8. expected_output MUST be a concrete description (2-4 sentences) of exactly what exists when
   the day is done: which command runs it, what the user sees or interacts with, which files
   are committed to the repo. Do NOT write vague phrases like "a working script" or "functional
   code" — name the file, describe the interaction, describe the visible result.
9. evaluation_criteria MUST be a numbered list of exactly 3-5 concrete, measurable checks that
   a reviewer can verify as pass/fail by running a command, opening a file, or interacting with
   the output. Vague criteria like "code is well-organized" or "agent responds correctly" are
   NOT acceptable. Good example: "1. Running `uvicorn main:app` starts the server without errors.
   2. POST /chat with {{\"message\":\"hello\"}} returns a JSON response containing a \"reply\" key.
   3. The GROQ_API_KEY is loaded from .env and .env is not committed to git.
   4. The / route returns an HTML page with a visible text input and submit button."
10. estimated_hours must be realistic given the learner's hours_per_week.

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
      "task_description": "Create a file called agent.py. In it, define a function generate_response(user_input: str) -> str that calls the Groq API using the groq Python library and returns the model reply as a plain string. Load your GROQ_API_KEY from a .env file using python-dotenv; raise a clear error if the key is missing. Use the model llama-3.3-70b-versatile and set a max_tokens of 512. Next, create main.py with a FastAPI app. Add a POST endpoint at /chat that accepts a JSON body {{\"message\": \"...\"}} and returns {{\"reply\": \"...\"}} by calling generate_response. Add a GET / route that returns a minimal HTML page containing a text input, a submit button, and a <div id='reply'> — use JavaScript fetch() to call /chat and display the response inside that div. Run the app with uvicorn main:app --reload and verify end-to-end.",
      "expected_output": "Running `uvicorn main:app --reload` starts the server without errors. Opening http://localhost:8000 shows the HTML page. Typing a message and clicking submit calls /chat and displays the model reply in the page. The files agent.py and main.py are committed to the repo; .env is excluded via .gitignore.",
      "evaluation_criteria": "1. check one — runnable command or observable behavior. 2. check two. 3. check three. 4. check four.",
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
- task_description must be a detailed step-by-step spec (5-8 sentences minimum): name the exact files, functions, endpoints, and behaviors required. Do not write one-liners.
- expected_output must concretely describe the result: which command runs it, what the user sees, which files are committed.
- evaluation_criteria must be a numbered list of 3-5 concrete, verifiable checks — each one testable by running a command or observing specific output.

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


def generate_next_day(
    program_title: str,
    program_summary: str,
    prev_day: dict,
    prev_submission_text: str,
    prev_feedback: dict,
    next_day_number: int,
    username: str = "learner",
) -> dict:
    """
    Generate a brand-new next day from scratch when no draft exists.
    Used by the simulation harness when day2_draft.json is not provided.
    Returns a dict matching AdaptedDay fields (no day_number — caller adds it).
    """
    score = prev_feedback.get("score", "?")
    passed = prev_feedback.get("passed", True)
    feedback_summary = prev_feedback.get("summary", "")
    strengths = prev_feedback.get("strengths", [])
    issues = prev_feedback.get("issues", [])

    def _bullets(items):
        return "\n".join(f"- {x}" for x in items) if items else "None."

    prompt = f"""You are designing Day {next_day_number} of {username}'s personalized AI-development program.

PROGRAM: {program_title}
{program_summary}

PREVIOUS DAY COMPLETED (Day {prev_day.get('day_number')}): {prev_day.get('title')}
Objective: {prev_day.get('objective')}

HOW {username} DID (score {score}/10, {'PASSED' if passed else 'FAILED'}):
{feedback_summary}
Strengths:
{_bullets(strengths)}
Issues:
{_bullets(issues)}

SUBMISSION EXCERPT (first 800 chars of actual work):
{prev_submission_text[:800]}

INSTRUCTIONS:
Create Day {next_day_number} — the natural continuation of Day {prev_day.get('day_number')}.
- Build directly on what {username} shipped, introducing one new concept or layer.
- If they struggled: add scaffolding and address weak points explicitly.
- If they excelled: add a stretch challenge.
- Address {username} in second person throughout.
- task_description must be 5-8 sentences: name exact files, functions, endpoints, and behaviors.
- expected_output must name the command to run it and what the user sees.
- evaluation_criteria must be 3-5 numbered, verifiable checks.
- research_topics must list specific tool/library names.

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
        raise ValueError(f"generate_next_day returned invalid JSON: {content}") from e

    try:
        generated = AdaptedDay.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Generated next day failed validation: {e}") from e

    result = generated.model_dump()
    result["day_number"] = next_day_number
    return result

def _normalize_days(data: dict) -> dict:
    """
    Fix the common LLM mistake of numbering days 1–16 instead of 0–15.
    Mutates and returns the data dict.
    """
    days = data.get("days")
    if not isinstance(days, list) or not days:
        return data
    # If all days appear to use 1-based numbering (first day == 1, last == 16)
    day_numbers = [d.get("day_number") for d in days if isinstance(d, dict) and "day_number" in d]
    if day_numbers and min(day_numbers) == 1 and max(day_numbers) <= 16:
        for d in days:
            if isinstance(d, dict) and "day_number" in d:
                d["day_number"] = d["day_number"] - 1
    return data


def generate_program(assessment: dict, username: str = "learner") -> GeneratedProgram:
    precedent_context = _precedent_context(assessment)
    user_prompt = build_user_prompt(assessment, precedent_context, username=username)

    last_err: Exception = ValueError("Program generation failed after all retries.")
    for attempt in range(3):
        try:
            response = _client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.6,
                response_format={"type": "json_object"},
            )
        except Exception as e:
            last_err = e
            continue

        content = response.choices[0].message.content

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            last_err = ValueError(f"Invalid JSON on attempt {attempt + 1}: {content[:200]}")
            continue

        data = _normalize_days(data)

        try:
            program = GeneratedProgram.model_validate(data)
        except ValidationError as e:
            last_err = ValueError(f"Validation failed on attempt {attempt + 1}: {e}")
            continue

        if len(program.days) != 16:
            last_err = ValueError(f"Expected 16 days, got {len(program.days)} on attempt {attempt + 1}")
            continue

        return program

    raise last_err
