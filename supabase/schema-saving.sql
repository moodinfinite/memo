-- Saving reliability migration. Run after schema-drafts.sql, before deploying the new app.
-- All changes and the deck-save function are installed in one transaction.
begin;

alter table public.study_sessions drop constraint if exists study_sessions_mode_check;
alter table public.study_sessions add constraint study_sessions_mode_check
  check (mode in ('flashcard', 'multiple_choice', 'typed', 'sentence', 'learn'));
-- A cross-deck session has no single parent deck. Its cards retain their actual set IDs.
alter table public.study_sessions alter column set_id drop not null;
alter table public.study_sessions add column if not exists sentence_entries jsonb not null default '[]';

alter table public.session_drafts drop constraint if exists session_drafts_mode_check;
alter table public.session_drafts add constraint session_drafts_mode_check
  check (mode in ('flashcard', 'multiple_choice', 'typed', 'sentence', 'learn'));
alter table public.session_drafts alter column set_id drop not null;
alter table public.session_drafts add column if not exists scope_id text;
update public.session_drafts set scope_id = coalesce(set_id::text, '__master__') where scope_id is null;
alter table public.session_drafts alter column scope_id set not null;
alter table public.session_drafts add column if not exists session_id uuid;
alter table public.session_drafts add column if not exists state jsonb not null default '{}';
create unique index if not exists session_drafts_user_scope_idx on public.session_drafts(user_id, scope_id);

-- Older clients omit scope_id and still upsert on (user_id, set_id).
-- Derive the scope before constraints run, so either client version can save.
create or replace function public.set_session_draft_scope()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  new.scope_id := coalesce(new.set_id::text, '__master__');
  return new;
end;
$$;
revoke all on function public.set_session_draft_scope() from public, anon, authenticated;
drop trigger if exists session_drafts_set_scope on public.session_drafts;
create trigger session_drafts_set_scope before insert or update on public.session_drafts
  for each row execute function public.set_session_draft_scope();

-- SECURITY INVOKER retains RLS. Explicit ownership checks also cover referenced rows.
create or replace function public.save_deck(
  p_id uuid, p_title text, p_description text, p_folder_id uuid, p_cards jsonb,
  p_create boolean default false
) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_card jsonb;
  v_ids uuid[];
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'Title is required'; end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) = 0 then
    raise exception 'At least one card is required';
  end if;
  if p_folder_id is not null and not exists(select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Folder is not owned by this user';
  end if;
  if p_create then
    insert into public.sets(id, user_id, title, description, folder_id)
    values (p_id, v_user, p_title, p_description, p_folder_id)
    on conflict (id) do nothing;
  end if;
  perform 1 from public.sets where id = p_id and user_id = v_user for update;
  if not found then raise exception 'Deck not found'; end if;

  select array_agg((value->>'id')::uuid) into v_ids from jsonb_array_elements(p_cards);
  if array_position(v_ids, null) is not null or cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'Every card needs a unique ID';
  end if;
  for v_card in select value from jsonb_array_elements(p_cards) loop
    if coalesce(trim(v_card->>'term'), '') = '' or coalesce(trim(v_card->>'definition'), '') = '' then
      raise exception 'Every card needs a term and definition';
    end if;
    insert into public.cards(id, user_id, set_id, term, definition, position)
    values ((v_card->>'id')::uuid, v_user, p_id, v_card->>'term', v_card->>'definition', (v_card->>'position')::integer)
    on conflict (id) do update set term = excluded.term, definition = excluded.definition, position = excluded.position
      where cards.user_id = v_user and cards.set_id = p_id;
    if not found then raise exception 'Card belongs to another deck'; end if;
  end loop;
  -- Only cards deliberately removed from the submitted deck are deleted.
  delete from public.cards where set_id = p_id and user_id = v_user and not (id = any(v_ids));
  update public.sets set title = p_title, description = p_description, folder_id = p_folder_id
    where id = p_id and user_id = v_user;
end;
$$;
revoke all on function public.save_deck(uuid, text, text, uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_deck(uuid, text, text, uuid, jsonb, boolean) to authenticated;
commit;
