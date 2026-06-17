"""
simulate_check.py — mirrors the real /submissions flow without a user account.

  Phase 1  Gather project files  →  evaluate against the current day
  Phase 2  If passed + day2_draft provided  →  adapt the next day

Usage:
    python simulate_check.py <project-folder> task.json [day2_draft.json]

    task.json shape:
        {
          "program_title": "...",
          "program_summary": "...",
          "username": "learner",
          "day": { day_number, title, objective, task_description,
                   expected_output, evaluation_criteria, research_topics,
                   estimated_hours, unlock_condition }
        }

    day2_draft.json shape  (optional — enables Day 2 adaptation):
        {
          "day_number": 2,
          "title": "...",
          "objective": "...",
          "task_description": "...",
          "expected_output": "...",
          "evaluation_criteria": "...",
          "research_topics": [...],
          "estimated_hours": 5,
          "unlock_condition": "..."
        }

Requires:
    - Backend running: uvicorn api:app --reload
    - ENABLE_SIMULATE=true in backend/.env
    - pip install requests
"""

import sys
import json
import fnmatch
import os
from pathlib import Path
import requests

# ── config ────────────────────────────────────────────────────────────────────
BASE_URL  = "http://localhost:8000"
MAX_CHARS = 12_000

SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "__pycache__",
    "dist", "build", ".next", ".idea", ".vscode", ".pytest_cache", "env",
}
SKIP_FILENAMES = {"package-lock.json", "yarn.lock", "poetry.lock", "Pipfile.lock"}
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".class", ".pyc", ".pyo",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".bin", ".dat", ".db", ".sqlite", ".sqlite3",
    ".pkl", ".npy", ".npz", ".h5", ".hdf5",
    ".csv",
}


# ── file gathering ────────────────────────────────────────────────────────────
def gather(root: str):
    root_path = Path(root).resolve()
    gi_file = root_path / ".gitignore"
    patterns = []
    if gi_file.exists():
        for line in gi_file.read_text(errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                patterns.append(line)

    def gitignored(rel, name):
        rel_posix = rel.replace("\\", "/")
        for pat in patterns:
            if fnmatch.fnmatch(name, pat) or fnmatch.fnmatch(rel_posix, pat):
                return True
        return False

    chunks = []
    for dirpath, dirnames, filenames in os.walk(root_path):
        rel_dir = str(Path(dirpath).relative_to(root_path))
        dirnames[:] = [
            d for d in sorted(dirnames)
            if d not in SKIP_DIRS and not gitignored(
                os.path.join(rel_dir, d) if rel_dir != "." else d, d
            )
        ]
        for filename in sorted(filenames):
            filepath = Path(dirpath) / filename
            rel = str(filepath.relative_to(root_path))
            if filename == ".env" or filename.startswith(".env."):
                continue
            if filename in SKIP_FILENAMES:
                continue
            if filepath.suffix.lower() in SKIP_EXTENSIONS:
                continue
            if gitignored(rel, filename):
                continue
            try:
                content = filepath.read_text(encoding="utf-8", errors="strict")
            except Exception:
                continue
            chunks.append(f"=== {rel} ===\n{content}\n")

    combined = "\n".join(chunks)
    truncated = len(combined) > MAX_CHARS
    return combined[:MAX_CHARS], truncated


# ── helpers ───────────────────────────────────────────────────────────────────
def load_json(path: str, label: str) -> dict:
    p = Path(path)
    if not p.is_file():
        print(f"Error: {label} file '{p}' not found.")
        sys.exit(1)
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"Error: {label} file is not valid JSON — {e}")
        sys.exit(1)


def section(label, items, bullet):
    if items:
        print(f"\n{label}:")
        for item in items:
            print(f"  {bullet} {item}")


def print_evaluation(ev: dict):
    score  = ev.get("score", "?")
    passed = ev.get("passed", False)
    status = "PASS ✓" if passed else "FAIL ✗"
    divider = "─" * 58
    print(f"\n{divider}")
    print(f"  Score : {score}/10   [{status}]")
    if ev.get("summary"):
        print(f"  {ev['summary']}")
    section("Strengths",      ev.get("strengths", []),      "✓")
    section("Issues",         ev.get("issues", []),          "✗")
    section("Required fixes", ev.get("required_fixes", []), "!")
    section("Next steps",     ev.get("next_steps", []),     "→")
    print(f"{divider}")


def print_adapted_day(day: dict):
    divider = "─" * 58
    print(f"\n{'═' * 58}")
    print(f"  ADAPTED DAY {day.get('day_number', 2)}: {day.get('title', '')}")
    print(f"{'═' * 58}")
    if day.get("objective"):
        print(f"\nObjective:\n  {day['objective']}")
    if day.get("task_description"):
        print(f"\nTask:\n  {day['task_description']}")
    if day.get("expected_output"):
        print(f"\nExpected output:\n  {day['expected_output']}")
    if day.get("evaluation_criteria"):
        print(f"\nEvaluation criteria:\n  {day['evaluation_criteria']}")
    topics = day.get("research_topics", [])
    if topics:
        if isinstance(topics, list):
            print(f"\nResearch topics: {', '.join(topics)}")
        else:
            print(f"\nResearch topics: {topics}")
    print(f"{divider}\n")


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 3:
        print("Usage: python simulate_check.py <project-folder> task.json [day2_draft.json]")
        sys.exit(1)

    folder      = sys.argv[1]
    task_file   = sys.argv[2]
    draft_file  = sys.argv[3] if len(sys.argv) >= 4 else None

    if not Path(folder).is_dir():
        print(f"Error: '{folder}' is not a directory.")
        sys.exit(1)

    task_data  = load_json(task_file, "task")
    draft_data = load_json(draft_file, "day2_draft") if draft_file else None

    # Validate task.json has the expected shape
    if "day" not in task_data:
        print("Error: task.json must have a 'day' key. See usage comments at top of script.")
        sys.exit(1)

    print(f"Task        : {task_data['day'].get('title', '?')}")
    if draft_data:
        print(f"Next day    : {draft_data.get('title', '?')} (Day {draft_data.get('day_number', '?')})")
    print(f"Gathering files from: {Path(folder).resolve()}")

    text, truncated = gather(folder)
    files_found = [
        line[4:-4] for line in text.splitlines()
        if line.startswith("=== ") and line.endswith(" ===")
    ]
    print(f"  Files     : {', '.join(files_found) if files_found else '(none)'}")
    print(f"  Characters: {len(text):,}{' (truncated to 12 000)' if truncated else ''}")
    print()

    # Build payload for /simulate/submit
    payload = {
        "program_title":   task_data.get("program_title", ""),
        "program_summary": task_data.get("program_summary", ""),
        "username":        task_data.get("username", "learner"),
        "day":             task_data["day"],
        "next_day_draft":  draft_data,
        "submission_text": text,
        "file_analysis":   None,
    }

    print("Sending to /simulate/submit …")
    try:
        resp = requests.post(f"{BASE_URL}/simulate/submit", json=payload, timeout=90)
    except requests.ConnectionError:
        print(f"Cannot reach {BASE_URL} — is the backend running?")
        sys.exit(1)

    if resp.status_code == 404:
        print("Got 404 — make sure ENABLE_SIMULATE=true in backend/.env and restart uvicorn.")
        sys.exit(1)
    if not resp.ok:
        print(f"Error {resp.status_code}: {resp.text}")
        sys.exit(1)

    data = resp.json()

    # ── Phase 1: evaluation result ────────────────────────────────────────────
    print("\n── PHASE 1: EVALUATION ──────────────────────────────────")
    print_evaluation(data["evaluation"])

    # ── Phase 2: next day (adapted or generated fresh) ────────────────────────
    if data.get("adapted") and data.get("adapted_day"):
        mode = "GENERATED FRESH" if data.get("generated_fresh") else "ADAPTED"
        day_num = data["adapted_day"].get("day_number", "?")
        print(f"\n── PHASE 2: DAY {day_num} ({mode}) ──────────────────────────")
        print_adapted_day(data["adapted_day"])
    elif data["evaluation"].get("passed"):
        print("\n(Passed but next-day generation failed — check backend logs.)")
    else:
        print("\n(Did not pass — next day generation skipped.)")


if __name__ == "__main__":
    main()
