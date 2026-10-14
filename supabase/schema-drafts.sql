-- ─────────────────────────────────────────────────────────────
-- session_drafts table — mid-session "resume where you left off" saves.
-- This file is IDEMPOTENT: safe to run even if the table already exists.
-- Run it in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Why this matters: the app saves drafts with
--   upsert(..., { onConflict: 'user_id,set_id' })
-- which REQUIRES a unique constraint on (user_id, set_id). If the
-- constraint is missing, every draft save fails silently and study
-- progress is lost on refresh/navigation.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.session_drafts (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  set_id        uuid references public.sets(id) on delete cascade not null,
  mode          text not null,
  card_order    uuid[] not null,
  current_index integer not null default 0,
  known_ids     uuid[] not null default '{}',
  unknown_ids   uuid[] not null default '{}',
  do_shuffle    boolean not null default false,
  timer_dur_min integer not null default 0,
  updated_at    timestamptz not null default now()
);

-- Add the unique constraint the app's upsert depends on (no-op if present)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'session_drafts_user_id_set_id_key'
  ) then
    alter table public.session_drafts
      add constraint session_drafts_user_id_set_id_key unique (user_id, set_id);
  end if;
end $$;

alter table public.session_drafts enable row level security;

drop policy if exists "Users can CRUD own drafts" on public.session_drafts;
create policy "Users can CRUD own drafts"
  on public.session_drafts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
