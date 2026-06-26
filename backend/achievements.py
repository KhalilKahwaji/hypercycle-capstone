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
# Badge scope (multiple-programs model)
# ---------------------------------------------------------------------------
# GLOBAL badges are account/CLI-level: earned once ever (program_id = NULL) and
# they survive switching/deleting programs. PROGRAM badges are earned per program
# (program_id set) and can be re-earned independently in each of the user's programs.
GLOBAL_BADGES: set[str] = {
    "program_generated",
    "setup_complete",
    "question_asker",
    "cli_debut",
    "cli_veteran",
}
PROGRAM_BADGES: set[str] = {b["key"] for b in BADGES} - GLOBAL_BADGES


def is_global_badge(badge_key: str) -> bool:
    """True for account-level badges stored with program_id = NULL."""
    return badge_key in GLOBAL_BADGES


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def award_badge(
    supabase, user_id: str, badge_key: str, program_id: str | None = None
) -> dict | None:
    """
    Award a badge if not already earned. Idempotent and best-effort (never raises).

    Scope rules:
    - GLOBAL badges are always stored with program_id = NULL (any passed program_id
      is ignored) and are earned once per user.
    - PROGRAM badges are stored with the given program_id; if none is supplied the
      award is skipped (we never write a mis-scoped program badge).

    Idempotency note: unique(user_id, badge_key, program_id) does NOT dedupe rows
    where program_id IS NULL (Postgres treats NULLs as distinct), so we check for an
    existing row first for both scopes rather than relying on an upsert conflict.
    """
    if badge_key not in BADGE_BY_KEY:
        logger.warning("award_badge: unknown key %r", badge_key)
        return None

    if badge_key in GLOBAL_BADGES:
        program_id = None
    elif program_id is None:
        # Program-scoped badge with no program to attribute it to — skip rather than
        # write a NULL-scoped row that would collide with the global semantics.
        logger.debug("award_badge: skipping program badge %r with no program_id", badge_key)
        return None

    try:
        existing_q = (
            supabase.table("achievements")
            .select("id")
            .eq("user_id", user_id)
            .eq("badge_key", badge_key)
        )
        existing_q = (
            existing_q.is_("program_id", "null")
            if program_id is None
            else existing_q.eq("program_id", program_id)
        )
        if existing_q.execute().data:
            return None  # already earned in this scope

        result = supabase.table("achievements").insert({
            "user_id": user_id,
            "badge_key": badge_key,
            "program_id": program_id,
        }).execute()
        if result.data:
            earned_at = result.data[0].get("earned_at")
            return {
                **BADGE_BY_KEY[badge_key],
                "earned": True,
                "earned_at": earned_at,
                "program_id": program_id,
            }
    except Exception as e:
        logger.warning("award_badge failed (key=%r, user=%s): %r", badge_key, user_id, e)
    return None


def check_and_award(
    supabase,
    user_id: str,
    event: str,
    ctx: dict[str, Any] | None = None,
    program_id: str | None = None,
) -> list[dict]:
    """
    Check which badges apply to this event and award any not yet earned.
    Returns a list of newly-earned badge dicts (may be empty). Never raises.

    `program_id` scopes program-specific badges. Global events
    (program_generated, setup_complete, cli_ask) ignore it; submission events
    award their program-specific badges against it.
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
            _check_submission_badges(supabase, user_id, event, ctx, new_badges, program_id)

    except Exception as exc:
        logger.warning(
            "check_and_award error (event=%s, user=%s): %r", event, user_id, exc
        )

    return new_badges


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _try_award(
    supabase, user_id: str, key: str, out: list, program_id: str | None = None
) -> None:
    b = award_badge(supabase, user_id, key, program_id)
    if b:
        out.append(b)


def _check_submission_badges(
    supabase, user_id: str, event: str, ctx: dict, out: list, program_id: str | None = None
) -> None:
    score = ctx.get("score", 0)
    passed = ctx.get("passed", False)
    program_day_id = ctx.get("program_day_id", "")

    # Resolve this program's day ids so the program-specific counts
    # (first_submission, consistent) reflect THIS program only — submissions has no
    # program_id column, only program_day_id.
    program_day_ids: list[str] = []
    if program_id:
        pd_res = (
            supabase.table("program_days")
            .select("id")
            .eq("program_id", program_id)
            .execute()
        )
        program_day_ids = [r["id"] for r in (pd_res.data or [])]

    # PROGRAM-SPECIFIC: first submission and 5-distinct-days within this program.
    if program_day_ids:
        prog_subs = (
            supabase.table("submissions")
            .select("program_day_id", count="exact")
            .eq("user_id", user_id)
            .in_("program_day_id", program_day_ids)
            .execute()
        )
        prog_sub_rows = prog_subs.data or []
        prog_sub_count = prog_subs.count if prog_subs.count is not None else len(prog_sub_rows)
        # The triggering submission is already inserted before this call, so <= 1 means first.
        if prog_sub_count <= 1:
            _try_award(supabase, user_id, "first_submission", out, program_id)
        distinct_days = len(set(r["program_day_id"] for r in prog_sub_rows if r.get("program_day_id")))
        if distinct_days >= 5:
            _try_award(supabase, user_id, "consistent", out, program_id)

    # GLOBAL: CLI usage counts across all of the user's programs.
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
        # PROGRAM-SPECIFIC quality badges.
        if score >= 10:
            _try_award(supabase, user_id, "perfect_score", out, program_id)
        if score >= 9:
            _try_award(supabase, user_id, "high_achiever", out, program_id)

        # First-try vs comeback: count submissions for this specific day (already
        # program-scoped via the day id).
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
                _try_award(supabase, user_id, "first_pass", out, program_id)
            else:
                _try_award(supabase, user_id, "comeback_kid", out, program_id)

        # PROGRAM-SPECIFIC milestone badges: completed days in THIS program.
        if program_id:
            done_res = (
                supabase.table("program_days")
                .select("id", count="exact")
                .eq("program_id", program_id)
                .eq("is_completed", True)
                .execute()
            )
            completed = done_res.count or 0
            if completed >= 5:
                _try_award(supabase, user_id, "day_5_done", out, program_id)
            if completed >= 8:
                _try_award(supabase, user_id, "halfway", out, program_id)
            if completed >= 10:
                _try_award(supabase, user_id, "day_10_done", out, program_id)
            if completed >= 16:
                _try_award(supabase, user_id, "graduation", out, program_id)
