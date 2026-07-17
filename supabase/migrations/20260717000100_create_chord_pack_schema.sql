create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.chord_packs (
  id uuid primary key default gen_random_uuid(),
  pack_name text not null check (char_length(pack_name) between 1 and 100),
  author_name text not null check (char_length(author_name) between 1 and 50),
  tags text[] not null default '{}',
  musical_key text not null check (musical_key = any(array['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'])),
  track_sound_name text not null check (char_length(track_sound_name) between 1 and 100),
  source_track_index integer check (source_track_index between 0 and 9),
  chords jsonb not null,
  reported_count integer not null default 0 check (reported_count >= 0),
  hidden boolean not null default false,
  deleted boolean not null default false,
  ownership_token_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index chord_packs_public_order_idx
  on public.chord_packs(created_at desc, id desc)
  where hidden = false and deleted = false;
alter table public.chord_packs enable row level security;
revoke all on public.chord_packs from public, anon, authenticated;

create or replace function private.normalize_pack_payload(payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  pack_name text;
  author_name text;
  musical_key text;
  track_sound_name text;
  source_track_index integer;
  tags text[] := '{}';
  tag_value jsonb;
  tag_text text;
  slot_value jsonb;
  slot_index integer;
  seen_slots integer[] := '{}';
  note_value jsonb;
  note_number integer;
  notes integer[];
  display_name text;
  normalized_chords jsonb := '[]'::jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object'
     or not (payload ?& array['packName','authorName','tags','key','trackSoundName','chords'])
     or payload - array['packName','authorName','tags','key','trackSoundName','sourceTrackIndex','chords'] <> '{}'::jsonb then
    raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
  end if;

  if jsonb_typeof(payload->'packName') <> 'string'
     or jsonb_typeof(payload->'authorName') <> 'string'
     or jsonb_typeof(payload->'key') <> 'string'
     or jsonb_typeof(payload->'trackSoundName') <> 'string' then
    raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
  end if;

  pack_name := btrim(payload->>'packName');
  author_name := btrim(payload->>'authorName');
  if author_name = '' then author_name := 'Anonymous'; end if;
  musical_key := payload->>'key';
  track_sound_name := btrim(payload->>'trackSoundName');

  if char_length(pack_name) not between 1 and 100
     or char_length(author_name) not between 1 and 50
     or char_length(track_sound_name) not between 1 and 100
     or not (musical_key = any(array['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'])) then
    raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
  end if;

  if payload ? 'sourceTrackIndex' and payload->'sourceTrackIndex' <> 'null'::jsonb then
    if jsonb_typeof(payload->'sourceTrackIndex') <> 'number'
       or not ((payload->>'sourceTrackIndex') ~ '^[0-9]+$') then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;
    if (payload->>'sourceTrackIndex')::numeric not between 0 and 9 then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;
    source_track_index := (payload->>'sourceTrackIndex')::integer;
  end if;

  if jsonb_typeof(payload->'tags') <> 'array'
     or jsonb_array_length(payload->'tags') > 10 then
    raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
  end if;
  for tag_value in select value from jsonb_array_elements(payload->'tags') loop
    if jsonb_typeof(tag_value) <> 'string' then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;
    tag_text := btrim(tag_value #>> '{}');
    if char_length(tag_text) not between 1 and 30
       or lower(tag_text) = any(select lower(existing_tag) from unnest(tags) existing_tag) then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;
    tags := array_append(tags, tag_text);
  end loop;

  if jsonb_typeof(payload->'chords') <> 'array'
     or jsonb_array_length(payload->'chords') <> 7 then
    raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
  end if;

  for slot_value in select value from jsonb_array_elements(payload->'chords') loop
    if jsonb_typeof(slot_value) <> 'object'
       or not (slot_value ?& array['slotIndex','notes','displayName'])
       or slot_value - array['slotIndex','notes','displayName'] <> '{}'::jsonb
       or jsonb_typeof(slot_value->'slotIndex') <> 'number'
       or not ((slot_value->>'slotIndex') ~ '^[0-9]+$')
       or jsonb_typeof(slot_value->'displayName') <> 'string'
       or jsonb_typeof(slot_value->'notes') <> 'array' then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;

    display_name := btrim(slot_value->>'displayName');
    if (slot_value->>'slotIndex')::numeric not between 1 and 7
       or char_length(display_name) not between 1 and 100
       or jsonb_array_length(slot_value->'notes') not between 1 and 4 then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;
    slot_index := (slot_value->>'slotIndex')::integer;
    if slot_index = any(seen_slots) then
      raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
    end if;

    notes := '{}';
    for note_value in select value from jsonb_array_elements(slot_value->'notes') loop
      if jsonb_typeof(note_value) <> 'number'
         or not ((note_value #>> '{}') ~ '^-?[0-9]+$') then
        raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
      end if;
      if (note_value #>> '{}')::numeric not between 36 and 96 then
        raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
      end if;
      note_number := (note_value #>> '{}')::integer;
      if note_number = any(notes) then
        raise exception 'INVALID_PACK_PAYLOAD' using errcode = '22023';
      end if;
      notes := array_append(notes, note_number);
    end loop;
    select array_agg(n order by n) into notes from unnest(notes) n;
    seen_slots := array_append(seen_slots, slot_index);
    normalized_chords := normalized_chords || jsonb_build_array(jsonb_build_object(
      'slotIndex', slot_index,
      'notes', to_jsonb(notes),
      'displayName', display_name
    ));
  end loop;

  select jsonb_agg(value order by (value->>'slotIndex')::integer)
    into normalized_chords
    from jsonb_array_elements(normalized_chords);

  return jsonb_build_object(
    'packName', pack_name,
    'authorName', author_name,
    'tags', to_jsonb(tags),
    'key', musical_key,
    'trackSoundName', track_sound_name,
    'sourceTrackIndex', source_track_index,
    'chords', normalized_chords
  );
end;
$$;

create or replace function private.public_pack_json(pack public.chord_packs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', pack.id,
    'packName', pack.pack_name,
    'authorName', pack.author_name,
    'tags', to_jsonb(pack.tags),
    'key', pack.musical_key,
    'trackSoundName', pack.track_sound_name,
    'sourceTrackIndex', pack.source_track_index,
    'chords', pack.chords,
    'reportedCount', pack.reported_count,
    'createdAt', pack.created_at,
    'updatedAt', pack.updated_at
  )
$$;

revoke all on function private.normalize_pack_payload(jsonb) from public, anon, authenticated;
revoke all on function private.public_pack_json(public.chord_packs) from public, anon, authenticated;
