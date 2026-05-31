"""
Program generation.
Takes a user's self-assessment and produces a personalized 15-day program
as structured JSON, using precedent programs as few-shot guidance.

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
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
USE_RAG = os.getenv("USE_RAG", "false").lower() == "true"

_client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")


class GeneratedDay(BaseModel):
    day_number: int = Field(..., ge=1, le=15)
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
    "spec-driven 15-day learning programs. Each day starts with a clear spec and ends "
    "with a concrete shippable deliverable, and each day builds on the previous one. "
    "You return STRICT JSON only. No markdown, no commentary."
)


def build_user_prompt(assessment: dict, precedent_context: str) -> str:
    return f"""
Design a personalized 15-day AI-development learning program for this learner.

LEARNER SELF-ASSESSMENT:
- Known languages / tools: {assessment.get('known_languages', 'unknown')}
- Experience level: {assessment.get('experience_level', 'unknown')}
- Goals: {assessment.get('goals', 'unknown')}
- Background: {assessment.get('background', 'unknown')}
- Hours available per week: {assessment.get('hours_per_week', 'unknown')}

PRECEDENT PROGRAMS (use as style/quality reference, DO NOT copy verbatim):
{precedent_context}

REQUIREMENTS:
- The program MUST be tailored to THIS learner. A beginner gets fundamentals first;
  an advanced learner gets harder, faster ramps. Reflect their stated goals and
  known languages directly in the day titles and tasks.
- Exactly 15 days, day_number 1 through 15.
- Each day must be a spec ending in a shippable deliverable.
- Days must build progressively. Day 15 should be a capstone/deployment day.
- estimated_hours should be realistic given their hours_per_week.
- Make it genuinely different from a generic template.

Return JSON in EXACTLY this shape:
{{
  "title": "short program title referencing the learner's goal",
  "summary": "2-3 sentence overview of the program and who it's for",
  "days": [
    {{
      "day_number": 1,
      "title": "...",
      "objective": "what the learner will be able to do after this day",
      "research_topics": ["topic 1", "topic 2"],
      "task_description": "the concrete spec / tasks for the day",
      "expected_output": "the shippable deliverable expected",
      "evaluation_criteria": "how a reviewer decides if it passes",
      "estimated_hours": 5,
      "unlock_condition": "what must be true to unlock this day"
    }}
    // ... days 2 through 15
  ]
}}

Rules:
- Output all 15 days.
- estimated_hours is a number.
- research_topics is an array of strings.
- No text outside the JSON object.
"""


def generate_program(assessment: dict) -> GeneratedProgram:
    precedent_context = _precedent_context(assessment)
    user_prompt = build_user_prompt(assessment, precedent_context)

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

    if len(program.days) != 15:
        raise ValueError(f"Expected 15 days, got {len(program.days)}")

    return program
