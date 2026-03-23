-- ─────────────────────────────────────────────────────────────
-- Run this in Supabase SQL editor AFTER the main schema.sql
-- Adds the upsert_card_progress RPC used by the study store
-- ─────────────────────────────────────────────────────────────

create or replace function public.upsert_card_progress(
  p_user_id     uuid,
  p_card_id     uuid,
  p_set_id      uuid,
  p_known_count integer,
  p_unknown_count integer
)
returns void as $$
begin
  insert into public.card_progress (user_id, card_id, set_id, known_count, unknown_count, last_seen_at)
  values (p_user_id, p_card_id, p_set_id, p_known_count, p_unknown_count, now())
  on conflict (user_id, card_id)
  do update set
    known_count   = card_progress.known_count   + excluded.known_count,
    unknown_count = card_progress.unknown_count + excluded.unknown_count,
    last_seen_at  = now();
end;
$$ language plpgsql security definer;

grant execute on function public.upsert_card_progress to authenticated;
