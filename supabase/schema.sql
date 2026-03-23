-- ─────────────────────────────────────────
-- Memo — Supabase schema (run in SQL editor)
-- ─────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Users ──────────────────────────────────
-- Supabase Auth handles the users table automatically.
-- We extend it with a profiles table.

create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  name        text not null,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'User'));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── Flashcard sets ──────────────────────────
create table public.sets (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  description text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.sets enable row level security;

create policy "Users can CRUD own sets"
  on public.sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sets_updated_at
  before update on public.sets
  for each row execute procedure public.touch_updated_at();


-- ── Cards ───────────────────────────────────
create table public.cards (
  id          uuid default gen_random_uuid() primary key,
  set_id      uuid references public.sets(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  term        text not null,
  definition  text not null,
  position    integer not null default 0,
  created_at  timestamptz default now()
);

alter table public.cards enable row level security;

create policy "Users can CRUD own cards"
  on public.cards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index cards_set_id_idx on public.cards(set_id);
create index cards_position_idx on public.cards(set_id, position);


-- ── Study sessions ──────────────────────────
create table public.study_sessions (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  set_id        uuid references public.sets(id) on delete cascade not null,
  mode          text not null check (mode in ('flashcard', 'multiple_choice', 'typed')),
  total_cards   integer not null,
  known_count   integer not null default 0,
  unknown_count integer not null default 0,
  score_pct     integer not null default 0,
  completed_at  timestamptz default now()
);

alter table public.study_sessions enable row level security;

create policy "Users can CRUD own sessions"
  on public.study_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index sessions_user_idx on public.study_sessions(user_id);
create index sessions_set_idx on public.study_sessions(set_id);
create index sessions_date_idx on public.study_sessions(user_id, completed_at desc);


-- ── Card progress ───────────────────────────
-- Tracks per-card mastery per user
create table public.card_progress (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  card_id       uuid references public.cards(id) on delete cascade not null,
  set_id        uuid references public.sets(id) on delete cascade not null,
  known_count   integer not null default 0,
  unknown_count integer not null default 0,
  last_seen_at  timestamptz default now(),
  unique(user_id, card_id)
);

alter table public.card_progress enable row level security;

create policy "Users can CRUD own card progress"
  on public.card_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index card_progress_user_set_idx on public.card_progress(user_id, set_id);
