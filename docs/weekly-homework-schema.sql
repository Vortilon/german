-- Weekly homework architecture (Supabase)
--
-- 1) homework_assignments: one row per week, created by admin(s)
-- 2) homework_student_weeks: one row per student per week to persist progress
--
-- Required env:
-- - SUPABASE_SERVICE_ROLE_KEY (server) for admin upserts
-- - ADMIN_EMAILS (server): comma-separated list of allowed admin emails

create table if not exists public.homework_assignments (
  week_start date primary key,
  extracted jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.homework_student_weeks (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null references public.homework_assignments(week_start) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  handwriting jsonb null,
  parent_report jsonb null,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- RLS (recommended)
alter table public.homework_assignments enable row level security;
alter table public.homework_student_weeks enable row level security;

-- Everyone logged in can read assignments
create policy "read assignments" on public.homework_assignments
for select to authenticated
using (true);

-- Students can read/write ONLY their row
create policy "read own student week" on public.homework_student_weeks
for select to authenticated
using (auth.uid() = user_id);

create policy "upsert own student week" on public.homework_student_weeks
for insert to authenticated
with check (auth.uid() = user_id);

create policy "update own student week" on public.homework_student_weeks
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

