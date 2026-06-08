"""
Achievements / badge system.

Call check_and_award(supabase, user_id, event, ctx) after key events.
Always best-effort: never raises, returns an empty list on any error.

Events
------
"program_generated"  — user generated a program
"setup_complete"     — user completed Day 0 via /complete-setup
"web_submission"     — POST /submissions evaluated  (ctx: score, passed, day_number, program_day_id)
"cli_submission"     — POST /cli/check non-dry-run   (ctx: score, passed, day_number, program_day_id)
"cli_ask"            — user used `hypersensei help`
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Badge catalogue (15 badges)
# ---------------------------------------------------------------------------

BADGES: list[dict] = [
    {
        "key": "program_generated",
        "name": "Curriculum Set",
        "description": "Generated your personalized 16-day program.",
        "icon": "BookOpen",
        "color": "#6fa8dc",
    },
    {
        "key": "setup_complete",
        "name": "Ready to Build",
        "description": "Completed the setup day and got your environment ready.",
        "icon": "Wrench",
        "color": "#e8b84b",
    },
    {
        "key": "first_submission",
        "name": "First Step",
        "description": "Submitted your work for the very first time.",
        "icon": "Send",
        "color": "#6fa8dc",
    },
    {
        "key": "first_pass",
        "name": "First Try",
        "description": "Passed a day on your very first submission attempt.",
        "icon": "Zap",
        "color": "#7fce8c",
    },
    {
        "key": "comeback_kid",
        "name": "Comeback Kid",
        "description": "Failed a day, then came back and passed it.",
        "icon": "RefreshCw",
        "color": "#e07a5f",
    },
    {
        "key": "perfect_score",
        "name": "Perfect 10",
        "description": "Scored 10/10 on any day.",
        "icon": "Target",
        "color": "#7fce8c",
    },
    {
        "key": "high_achiever",
        "name": "High Achiever",
        "description": "Passed any day with a score of 9 or higher.",
        "icon": "Star",
        "color": "#e8b84b",
    },
    {
        "key": "consistent",
        "name": "Consistent",
        "description": "Submitted work for 5 different program days.",
        "icon": "Layers",
        "color": "#6fa8dc",
    },
    {
        "key": "day_5_done",
        "name": "Week One",
        "description": "Completed 5 learning days.",
        "icon": "Calendar",
        "color": "#7fce8c",
    },
    {
        "key": "halfway",
        "name": "Halfway There",
        "description": "Completed 8 days — past the halfway mark.",
        "icon": "TrendingUp",
        "color": "#e8b84b",
    },
    {
        "key": "day_10_done",
        "name": "Double Digits",
        "description": "Completed 10 learning days.",
        "icon": "Award",
        "color": "#7fce8c",
    },
    {
        "key": "graduation",
        "name": "Graduate",
        "description": "Completed all 16 days of your bootcamp.",
        "icon": "GraduationCap",
        "color": "#e8b84b",
    },
    {
        "key": "cli_debut",
        "name": "Terminal Hero",
        "description": "Submitted your first work via the HyperSensei CLI.",
        "icon": "Terminal",
        "color": "#7fce8c",
    },
    {
        "key": "cli_veteran",
        "name": "CLI Veteran",
        "description": "Submitted 5 times using the HyperSensei CLI.",
        "icon": "Code",
        "color": "#e8b84b",
    },
    {
        "key": "question_asker",
        "name": "Curious Mind",
        "description": "Asked HyperSensei for a hint via the CLI.",
        "icon": "MessageCircle",
        "color": "#6fa8dc",
    },
]

BADGE_BY_KEY: dict[str, dict] = {b["key"]: b for b in BADGES}


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def award_badge(supabase, user_id: str, badge_key: str) -> dict | None:
    """
    Award a badge if not already earned.

    Uses upsert with ignore_duplicates=True so the call is idempotent:
    - New award  → row inserted, result.data has the row → returns badge dict.
    - Already earned → conflict ignored, result.data is empty  → returns None.
    - Any DB error (e.g. table missing) → logged at WARNING, returns None.
    """
    if badge_key not in BADGE_BY_KEY:
        logger.warning("award_badge: unknown key %r", badge_key)
        return None
    try:
        result = supabase.table("achievements").upsert(
            {"user_id": user_id, "badge_key": badge_key},
            on_conflict="user_id,badge_key",
            ignore_duplicates=True,
        ).execute()
        if result.data:
            earned_at = result.data[0].get("earned_at")
            return {**BADGE_BY_KEY[badge_key], "earned": True, "earned_at": earned_at}
    except Exception as e:
        logger.warning("award_badge failed (key=%r, user=%s): %r", badge_key, user_id, e)
    return None


def check_and_award(
    supabase,
    user_id: str,
    event: str,
    ctx: dict[str, Any] | None = None,
) -> list[dict]:
    """
    Check which badges apply to this event and award any not yet earned.
    Returns a list of newly-earned badge dicts (may be empty). Never raises.
    """
    ctx = ctx or {}
    new_badges: list[dict] = []

    try:
        if event == "program_generated":
            _try_award(supabase, user_id, "program_generated", new_badges)

        elif event == "setup_complete":
            _try_award(supabase, user_id, "setup_complete", new_badges)

        elif event == "cli_ask":
            _try_award(supabase, user_id, "question_asker", new_badges)

        elif event in ("web_submission", "cli_submission"):
            _check_submission_badges(supabase, user_id, event, ctx, new_badges)

    except Exception as exc:
        logger.warning(
            "check_and_award error (event=%s, user=%s): %r", event, user_id, exc
        )

    return new_badges


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _try_award(supabase, user_id: str, key: str, out: list) -> None:
    b = award_badge(supabase, user_id, key)
    if b:
        out.append(b)


def _check_submission_badges(
    supabase, user_id: str, event: str, ctx: dict, out: list
) -> None:
    score = ctx.get("score", 0)
    passed = ctx.get("passed", False)
    program_day_id = ctx.get("program_day_id", "")

    # First submission ever (count is already >= 1 since insert happened before this call)
    total_res = (
        supabase.table("submissions")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    total_subs = total_res.count or 0
    if total_subs <= 1:
        _try_award(supabase, user_id, "first_submission", out)

    # Consistent: submitted for 5+ distinct days
    all_subs = (
        supabase.table("submissions")
        .select("program_day_id")
        .eq("user_id", user_id)
        .execute()
    )
    distinct_days = len(set(r["program_day_id"] for r in (all_subs.data or [])))
    if distinct_days >= 5:
        _try_award(supabase, user_id, "consistent", out)

    # CLI-specific
    if event == "cli_submission":
        cli_res = (
            supabase.table("submissions")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("source", "cli")
            .execute()
        )
        cli_count = cli_res.count or 0
        if cli_count <= 1:
            _try_award(supabase, user_id, "cli_debut", out)
        if cli_count >= 5:
            _try_award(supabase, user_id, "cli_veteran", out)

    if passed:
        if score >= 10:
            _try_award(supabase, user_id, "perfect_score", out)
        if score >= 9:
            _try_award(supabase, user_id, "high_achiever", out)

        # First-try vs comeback: count submissions for this specific day
        if program_day_id:
            day_subs = (
                supabase.table("submissions")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("program_day_id", program_day_id)
                .execute()
            )
            day_sub_count = day_subs.count or 0
            if day_sub_count <= 1:
                _try_award(supabase, user_id, "first_pass", out)
            else:
                _try_award(supabase, user_id, "comeback_kid", out)

        # Milestone badges: count completed days in the user's program
        prog_res = (
            supabase.table("programs")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        if prog_res.data:
            done_res = (
                supabase.table("program_days")
                .select("id", count="exact")
                .eq("program_id", prog_res.data[0]["id"])
                .eq("is_completed", True)
                .execute()
            )
            completed = done_res.count or 0
            if completed >= 5:
                _try_award(supabase, user_id, "day_5_done", out)
            if completed >= 8:
                _try_award(supabase, user_id, "halfway", out)
            if completed >= 10:
                _try_award(supabase, user_id, "day_10_done", out)
            if completed >= 16:
                _try_award(supabase, user_id, "graduation", out)
