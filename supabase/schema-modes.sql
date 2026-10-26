-- ─────────────────────────────────────────────────────────────
-- Separate study drafts per mode (Learn and Flashcards no longer
-- overwrite each other's saved progress).
--
-- Run once in the Supabase SQL editor, after schema-saving.sql.
-- Safe to re-run. Existing drafts are kept; the app reads an old
-- one-per-set draft for the mode it was saved in, then re-saves it
-- under the new per-mode scope ("<set id>:learn", "__master__:flashcard").
-- ─────────────────────────────────────────────────────────────

-- Keep the scope the app sends; only fill it in for older clients that omit it
create or replace function public.set_session_draft_scope()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.scope_id is null then
    new.scope_id := coalesce(new.set_id::text, '__master__');
  end if;
  return new;
end;
$$;
revoke all on function public.set_session_draft_scope() from public, anon, authenticated;

-- One draft per set would block a second mode's draft; (user_id, scope_id) stays unique
alter table public.session_drafts drop constraint if exists session_drafts_user_id_set_id_key;
