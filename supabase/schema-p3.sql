-- ─────────────────────────────────────────────────────────────
-- Phase 3 schema additions
-- Run this AFTER schema.sql and rpc.sql from Phase 2
-- ─────────────────────────────────────────────────────────────

-- ── Folders ──────────────────────────────────────────────────
create table public.folders (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  color      text not null default '#84cc16',
  position   integer not null default 0,
  created_at timestamptz default now()
);

alter table public.folders enable row level security;

create policy "Users can CRUD own folders"
  on public.folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index folders_user_idx on public.folders(user_id);

-- ── Add folder_id + pinned to sets ───────────────────────────
alter table public.sets
  add column if not exists folder_id uuid references public.folders(id) on delete set null,
  add column if not exists pinned boolean not null default false;

create index sets_folder_idx on public.sets(folder_id);
create index sets_pinned_idx on public.sets(user_id, pinned);
