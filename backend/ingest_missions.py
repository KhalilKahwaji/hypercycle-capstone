"""
Ingest mission YAML files into the Supabase `missions` table with Gemini embeddings.

Run ONCE locally (re-run whenever missions change). Reads backend/.env for:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY

Usage (from backend/):
    pip install pyyaml google-generativeai supabase python-dotenv
    python ingest_missions.py --dry-run        # parse + embed count, no DB writes
    python ingest_missions.py                  # real run, upserts into Supabase
    python ingest_missions.py --path missions  # custom mission folder

Embeds each mission from: title + summary + goal + brief + skills.taught.
Embedding model: gemini-embedding-001, output forced to 768 dims to match the
missions.embedding vector(768) column.
"""

import os
import sys
import glob
import time
import argparse

import yaml
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

EMBED_MODEL = "models/gemini-embedding-001"
EXPECTED_DIM = 768           # we request this explicitly below
SLEEP_BETWEEN = 0.5          # gentle pacing to avoid free-tier rate limits


def build_embed_text(m: dict) -> str:
    """The text we embed for retrieval — captures what the mission is about."""
    parts = [
        m.get("title", ""),
        m.get("summary", ""),
        m.get("goal", ""),
        m.get("brief", ""),
    ]
    skills = (m.get("skills") or {}).get("teaches") or []
    if skills:
        parts.append("Skills taught: " + ", ".join(skills))
    if m.get("track"):
        parts.append("Track: " + str(m["track"]))
    return "\n".join(p for p in parts if p).strip()


def embed(genai, text: str):
    """Embed text at 768 dims. Tries output_dimensionality; falls back if unsupported."""
    try:
        resp = genai.embed_content(
            model=EMBED_MODEL,
            content=text,
            task_type="retrieval_document",
            output_dimensionality=EXPECTED_DIM,
        )
    except TypeError:
        # older signature without output_dimensionality
        resp = genai.embed_content(
            model=EMBED_MODEL,
            content=text,
            task_type="retrieval_document",
        )
    return resp["embedding"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default="missions", help="Folder with mission YAML files")
    parser.add_argument("--dry-run", action="store_true", help="Parse + embed without DB writes")
    args = parser.parse_args()

    if not GEMINI_API_KEY:
        sys.exit("GEMINI_API_KEY not set (check backend/.env).")
    if not args.dry_run and (not SUPABASE_URL or not SUPABASE_KEY):
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.")

    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)

    yaml_files = sorted(glob.glob(os.path.join(args.path, "**", "*.yaml"), recursive=True))
    yaml_files = [f for f in yaml_files if "schema" not in f.split(os.sep)]
    if not yaml_files:
        sys.exit(f"No mission YAML files found under {args.path}/")

    print(f"Found {len(yaml_files)} mission files. Model: {EMBED_MODEL}, dim: {EXPECTED_DIM}")

    supabase = None
    if not args.dry_run:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    ok, failed = 0, 0
    for path in yaml_files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                m = yaml.safe_load(f)
            if not m or "id" not in m:
                print(f"  SKIP (no id): {path}")
                failed += 1
                continue

            vector = embed(genai, build_embed_text(m))
            if len(vector) != EXPECTED_DIM:
                print(f"  WARN {m['id']}: got dim {len(vector)} (expected {EXPECTED_DIM})")

            row = {
                "id": m["id"],
                "version": m.get("version", 1),
                "title": m.get("title", ""),
                "track": m.get("track"),
                "difficulty_tier": m.get("difficulty_tier"),
                "min_age_band": m.get("min_age_band"),
                "est_minutes": m.get("est_minutes"),
                "summary": m.get("summary"),
                "goal": m.get("goal"),
                "content": m,
                "embedding": vector,
            }

            if args.dry_run:
                print(f"  OK (dry): {m['id']} ({len(vector)}-dim)")
            else:
                supabase.table("missions").upsert(row, on_conflict="id").execute()
                print(f"  upserted: {m['id']}")
            ok += 1
            time.sleep(SLEEP_BETWEEN)

        except Exception as e:
            print(f"  FAIL {path}: {e}")
            failed += 1

    print(f"\nDone. {ok} ok, {failed} failed.")


if __name__ == "__main__":
    main()