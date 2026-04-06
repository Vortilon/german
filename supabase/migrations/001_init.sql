-- Run in Supabase SQL editor (or supabase db push)

-- Homework rows: one per user per week (week_start = Monday date)
create table if not exists public.homework_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  topic text,
  extracted jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  handwriting jsonb not null default '{}'::jsonb,
  parent_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists homework_weeks_user_week on public.homework_weeks (user_id, week_start desc);

alter table public.homework_weeks enable row level security;

create policy "Users read own homework"
  on public.homework_weeks for select
  using (auth.uid() = user_id);

create policy "Users insert own homework"
  on public.homework_weeks for insert
  with check (auth.uid() = user_id);

create policy "Users update own homework"
  on public.homework_weeks for update
  using (auth.uid() = user_id);

-- Storage: bucket for homework + notebook photos (private)
insert into storage.buckets (id, name, public)
values ('homework', 'homework', false)
on conflict (id) do nothing;

create policy "Users upload own homework files"
  on storage.objects for insert
  with check (
    bucket_id = 'homework'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users read own homework files"
  on storage.objects for select
  using (
    bucket_id = 'homework'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own homework files"
  on storage.objects for update
  using (
    bucket_id = 'homework'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own homework files"
  on storage.objects for delete
  using (
    bucket_id = 'homework'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
