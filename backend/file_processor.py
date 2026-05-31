"""
Universal File Analyzer (originally Day 7).
Integrated directly into the main backend so submissions are analyzed
in-process: no separate :8001 service.

Supports .txt .md .py .json .pdf
- plain decode for text/code/json/markdown
- pdfplumber for PDFs
Truncates to MAX_CHARS, returns Groq structured analysis validated by Pydantic.
"""

import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import List

import pdfplumber
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

# Groq client is shared from api.py to avoid duplicate clients, but we also
# build one here so this module works standalone (e.g. for unit tests).
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
MAX_CHARS = 5000
SUPPORTED_EXTENSIONS = {".txt", ".md", ".py", ".json", ".pdf"}

_groq_client = None


def _client() -> OpenAI:
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
            raise ValueError("Missing GROQ_API_KEY")
        _groq_client = OpenAI(
            api_key=GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
    return _groq_client


class FileAnalysis(BaseModel):
    summary: str = Field(..., min_length=1)
    key_topics: List[str] = Field(default_factory=list)
    language_used: str = Field(..., min_length=1)
    complexity_level: int = Field(..., ge=1, le=10)
    line_count: int = Field(..., ge=0)


class ProcessedFile(BaseModel):
    filename: str
    extension: str
    raw_text: str
    truncated: bool
    original_char_count: int
    line_count: int


def get_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def extract_text_from_plain_file(file_bytes: bytes) -> str:
    return file_bytes.decode("utf-8", errors="ignore")


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        temp_file.write(file_bytes)
        temp_path = temp_file.name
    try:
        with pdfplumber.open(temp_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(page_text)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    return "\n\n".join(text_parts)


def extract_raw_text(filename: str, file_bytes: bytes) -> str:
    extension = get_extension(filename)
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format: {extension}. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
    if extension == ".pdf":
        return extract_text_from_pdf(file_bytes)
    return extract_text_from_plain_file(file_bytes)


def process_file(filename: str, file_bytes: bytes) -> ProcessedFile:
    extension = get_extension(filename)
    raw_text = extract_raw_text(filename, file_bytes).strip()
    if not raw_text:
        raise ValueError("File is empty or no readable text could be extracted.")

    original_char_count = len(raw_text)
    truncated = False
    if original_char_count > MAX_CHARS:
        raw_text = raw_text[:MAX_CHARS]
        truncated = True

    line_count = len(raw_text.splitlines())
    return ProcessedFile(
        filename=filename,
        extension=extension,
        raw_text=raw_text,
        truncated=truncated,
        original_char_count=original_char_count,
        line_count=line_count,
    )


def analyze_with_groq(processed_file: ProcessedFile) -> FileAnalysis:
    system_prompt = (
        "You analyze uploaded files and return structured JSON only. "
        "Do not include markdown. Do not include extra text."
    )
    user_prompt = f"""
Analyze this uploaded file.

Filename: {processed_file.filename}
Extension: {processed_file.extension}
Line count: {processed_file.line_count}
Was truncated: {processed_file.truncated}
Original character count: {processed_file.original_char_count}

File content:
{processed_file.raw_text}

Return JSON exactly in this format:
{{
  "summary": "brief summary of the file",
  "key_topics": ["topic 1", "topic 2", "topic 3"],
  "language_used": "programming language or natural language used",
  "complexity_level": 1,
  "line_count": {processed_file.line_count}
}}

Rules:
- complexity_level must be an integer from 1 to 10.
- line_count must match the provided line count.
- language_used can be Python, Markdown, JSON, English, Mixed, or Unknown.
"""
    response = _client().chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq returned invalid JSON: {content}") from e
    try:
        return FileAnalysis.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Groq response failed validation: {e}") from e


def analyze_file(filename: str, file_bytes: bytes) -> dict:
    processed_file = process_file(filename, file_bytes)
    analysis = analyze_with_groq(processed_file)
    return {
        "filename": processed_file.filename,
        "extension": processed_file.extension,
        "truncated": processed_file.truncated,
        "original_char_count": processed_file.original_char_count,
        "raw_text": processed_file.raw_text,  # for the evaluator
        "analysis": analysis.model_dump(),
    }
