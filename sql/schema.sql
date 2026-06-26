-- =====================================================================
-- HyperCycle Capstone — Supabase schema
-- Run this in the Supabase SQL editor.
-- The backend uses the SERVICE ROLE key and bypasses RLS, so the RLS
-- policies below are a safety net for any client using the anon key.
-- =====================================================================

-- ---------- USERS (extend existing table) ----------------------------
-- You already have: users(id, email, full_name, username, password_hash)
-- Add the admin flag. Safe to re-run.
alter table public.users add column if not exists is_admin boolean not null default false;
alter table public.users add column if not exists created_at timestamptz not null default now();

-- ---------- SELF ASSESSMENTS -----------------------------------------
create table if not exists public.self_assessments (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.users(id) on delete cascade,
    known_languages text,            -- e.g. "Python, some JS"
    experience_level text,           -- beginner | intermediate | advanced
    goals           text,            -- what they want to learn / build
    background      text,            -- student, career switcher, etc.
    hours_per_week  int,
    created_at      timestamptz not null default now(),
    unique (user_id)                 -- one current assessment per user
);

-- ---------- PROGRAMS --------------------------------------------------
-- Multiple programs per user (up to 3, enforced in the backend), exactly one active.
create table if not exists public.programs (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.users(id) on delete cascade,
    title       text not null,
    summary     text,
    total_days  int not null default 15,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- ---------- PROGRAM DAYS ---------------------------------------------
create table if not exists public.program_days (
    id                  uuid primary key default gen_random_uuid(),
    program_id          uuid not null references public.programs(id) on delete cascade,
    day_number          int not null,
    title               text not null,
    objective           text,
    research_topics     text,        -- stored as newline-joined or JSON string
    task_description    text,
    expected_output     text,
    evaluation_criteria text,
    estimated_hours     numeric,
    unlock_condition    text,
    is_unlocked         boolean not null default false,
    is_completed        boolean not null default false,
    created_at          timestamptz not null default now(),
    unique (program_id, day_number)
);

-- Day 1 of every program starts unlocked. Enforced in backend on insert.

-- ---------- SUBMISSIONS (extend existing table) ----------------------
-- You already have: submissions(id, user_id, day_number, content, file_url)
-- Link submissions to a specific program day. day_number is kept for
-- backward compatibility but program_day_id is the new source of truth.
alter table public.submissions add column if not exists program_day_id uuid references public.program_days(id) on delete set null;
alter table public.submissions add column if not exists file_analysis jsonb;
alter table public.submissions add column if not exists created_at timestamptz not null default now();

-- Allow multiple submissions per day (resubmission after a fail).
-- If you previously had a unique(user_id, day_number) constraint, drop it:
do $$
begin
    if exists (
        select 1 from pg_constraint
        where conname = 'submissions_user_id_day_number_key'
    ) then
        alter table public.submissions drop constraint submissions_user_id_day_number_key;
    end if;
end $$;

-- ---------- SUBMISSION FEEDBACK --------------------------------------
create table if not exists public.submission_feedback (
    id              uuid primary key default gen_random_uuid(),
    submission_id   uuid not null references public.submissions(id) on delete cascade,
    user_id         uuid not null references public.users(id) on delete cascade,
    program_day_id  uuid references public.program_days(id) on delete set null,
    score           int not null,           -- 1..10
    passed          boolean not null,
    summary         text,
    strengths       text,
    issues          text,
    required_fixes  text,
    next_steps      text,
    raw_feedback    jsonb,                   -- full Groq JSON, for debugging
    created_at      timestamptz not null default now()
);

-- ---------- ACHIEVEMENTS (gamification) --------------------------------
-- program_id NULL  => GLOBAL badge (account/CLI-level, earned once per user).
-- program_id set   => PROGRAM-specific badge (re-earnable per program).
create table if not exists public.achievements (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.users(id) on delete cascade,
    badge_key   text not null,
    program_id  uuid references public.programs(id) on delete cascade,
    earned_at   timestamptz not null default now(),
    unique (user_id, badge_key, program_id)
);

-- ---------- SUBMISSIONS: source column --------------------------------
-- Tracks whether a submission came from the web UI or the CLI.
alter table public.submissions add column if not exists source text not null default 'web';

-- Also add age to self_assessments (added in Feature 1).
alter table public.self_assessments add column if not exists age int;

-- submission_feedback: make submission_id nullable (admin passes have no submission).
alter table public.submission_feedback alter column submission_id drop not null;

-- ---------- MULTIPLE PROGRAMS PER USER (Feature: up to 3, one active) -----
-- Safe to re-run. programs: drop the old one-per-user constraint, add is_active.
alter table public.programs add column if not exists is_active boolean not null default true;
do $$
begin
    if exists (select 1 from pg_constraint where conname = 'programs_user_id_key') then
        alter table public.programs drop constraint programs_user_id_key;
    end if;
end $$;

-- Enforce the single-active invariant at the DB level: at most one active program per
-- user. The backend deactivates others before activating a program so this is never
-- violated mid-update. (Existing data has exactly one program per user, so this is safe
-- to add.)
create unique index if not exists uq_programs_one_active
    on public.programs (user_id) where is_active;

-- achievements: add program_id (NULL = global badge) and switch the uniqueness to
-- (user_id, badge_key, program_id).
alter table public.achievements
    add column if not exists program_id uuid references public.programs(id) on delete cascade;
do $$
begin
    if exists (select 1 from pg_constraint where conname = 'achievements_user_id_badge_key_key') then
        alter table public.achievements drop constraint achievements_user_id_badge_key_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'achievements_user_id_badge_key_program_id_key') then
        alter table public.achievements
            add constraint achievements_user_id_badge_key_program_id_key
            unique (user_id, badge_key, program_id);
    end if;
end $$;

-- Postgres treats NULLs as distinct in unique constraints, so the constraint above
-- does NOT dedupe GLOBAL badges (program_id IS NULL). This partial index does.
create unique index if not exists uq_achievements_global
    on public.achievements (user_id, badge_key)
    where program_id is null;

-- ---------- INDEXES ---------------------------------------------------
create index if not exists idx_program_days_program on public.program_days(program_id);
create index if not exists idx_submissions_user on public.submissions(user_id);
create index if not exists idx_submissions_day on public.submissions(program_day_id);
create index if not exists idx_feedback_user on public.submission_feedback(user_id);
create index if not exists idx_achievements_user on public.achievements(user_id);
create index if not exists idx_achievements_program on public.achievements(program_id);
create index if not exists idx_programs_user_active on public.programs(user_id, is_active);

-- ---------- ROW LEVEL SECURITY ---------------------------------------
-- Service role bypasses these. They protect against accidental anon access.
alter table public.self_assessments    enable row level security;
alter table public.programs             enable row level security;
alter table public.program_days         enable row level security;
alter table public.submission_feedback  enable row level security;

-- Note: with the service-role key (used by the backend) these policies are
-- bypassed. They exist so that if you ever expose the anon key, users can
-- only read their own rows. Admin reads happen through the backend, which
-- enforces is_admin in Python before querying with the service role.
create policy "own_assessment" on public.self_assessments
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_program" on public.programs
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_program_days" on public.program_days
    for select using (
        program_id in (select id from public.programs where user_id = auth.uid())
    );

create policy "own_feedback" on public.submission_feedback
    for select using (auth.uid() = user_id);
