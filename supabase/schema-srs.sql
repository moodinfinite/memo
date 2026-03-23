-- ─────────────────────────────────────────────────────────────
-- SRS (Spaced Repetition) table
-- Run this AFTER schema-p3.sql
-- ─────────────────────────────────────────────────────────────

create table public.card_srs (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  card_id      uuid references public.cards(id) on delete cascade not null,
  set_id       uuid references public.sets(id) on delete cascade not null,
  easiness     numeric not null default 2.5,
  interval     integer not null default 1,
  repetitions  integer not null default 0,
  next_review  date not null default current_date,
  last_seen_at timestamptz default now(),
  unique(user_id, card_id)
);

alter table public.card_srs enable row level security;

create policy "Users can CRUD own SRS data"
  on public.card_srs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index card_srs_user_set_idx on public.card_srs(user_id, set_id);
create index card_srs_next_review_idx on public.card_srs(user_id, next_review);
