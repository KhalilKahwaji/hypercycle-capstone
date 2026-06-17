"""
Submission evaluation.
Evaluates a user's submission against the assigned program day and returns
structured JSON feedback. Passing rule: score >= 7.

This replaces the LangGraph machinery from Day 6 with a simple, deploy-friendly
single-call evaluation. (Day 6's retry loop concept lives in the UI: a failed
submission just lets the user resubmit.)
"""

import json
import os
from typing import List, Optional

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
PASS_THRESHOLD = 7

_client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")


class Evaluation(BaseModel):
    score: int = Field(..., ge=1, le=10)
    passed: bool
    summary: str
    strengths: List[str] = Field(default_factory=list)
    issues: List[str] = Field(default_factory=list)
    required_fixes: List[str] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)
    unlock_next_day: bool


SYSTEM_PROMPT = (
    "You are a strict but fair AI-development mentor giving direct feedback to a student. "
    "Always address the student as 'you' / 'your' — never 'the learner', 'they', or 'the student'. "
    "Judge whether they completed the task, the quality of the work, and whether they understand what they did. "
    "You return STRICT JSON only. No markdown, no commentary."
)


def build_user_prompt(
    day: dict,
    submission_text: str,
    file_analysis: Optional[dict],
    file_raw_text: Optional[str],
) -> str:
    file_block = "No file was uploaded."
    if file_analysis:
        file_block = (
            f"FILE ANALYSIS (auto-generated):\n{json.dumps(file_analysis, indent=2)}\n\n"
        )
        if file_raw_text:
            file_block += f"FILE RAW TEXT (truncated):\n{file_raw_text}"

    return f"""
Evaluate this submission against the assigned day.

ASSIGNED DAY:
- Title: {day.get('title')}
- Objective: {day.get('objective')}
- Task description: {day.get('task_description')}
- Expected output: {day.get('expected_output')}
- Evaluation criteria: {day.get('evaluation_criteria')}

LEARNER'S TEXT SUBMISSION:
{submission_text}

{file_block}

Score from 1 to 10 based on:
- Did they complete the assigned task?
- Is the quality good?
- Do they demonstrate understanding?

A score of {PASS_THRESHOLD} or higher means PASSED. Below means they must resubmit.

Return JSON in EXACTLY this shape:
{{
  "score": 7,
  "passed": true,
  "summary": "1-2 sentence overall judgment",
  "strengths": ["..."],
  "issues": ["..."],
  "required_fixes": ["what they MUST fix to pass, empty if passed"],
  "next_steps": ["suggestions for going further"],
  "unlock_next_day": true
}}

Rules:
- score is an integer 1-10.
- passed must be true if and only if score >= {PASS_THRESHOLD}.
- unlock_next_day must equal passed.
- Be specific and reference the actual submission content.
- All text must address the student directly: use "you" / "your", never "the learner", "they", or "the student".
- No text outside the JSON object.
"""


def evaluate_submission(
    day: dict,
    submission_text: str,
    file_analysis: Optional[dict] = None,
    file_raw_text: Optional[str] = None,
) -> Evaluation:
    user_prompt = build_user_prompt(day, submission_text, file_analysis, file_raw_text)

    response = _client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Evaluation returned invalid JSON: {content}") from e

    try:
        evaluation = Evaluation.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Evaluation failed validation: {e}") from e

    # Enforce the passing rule server-side regardless of what the model said.
    evaluation.passed = evaluation.score >= PASS_THRESHOLD
    evaluation.unlock_next_day = evaluation.passed
    return evaluation
