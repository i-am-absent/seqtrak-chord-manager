create or replace function public.create_pack(payload jsonb, ownership_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized jsonb;
  created public.chord_packs%rowtype;
begin
  if ownership_token is null or ownership_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_OWNERSHIP_TOKEN' using errcode = '22023';
  end if;
  normalized := private.normalize_pack_payload(payload);
  insert into public.chord_packs(
    pack_name, author_name, tags, musical_key, track_sound_name,
    source_track_index, chords, ownership_token_hash
  ) values (
    normalized->>'packName',
    normalized->>'authorName',
    array(select jsonb_array_elements_text(normalized->'tags')),
    normalized->>'key',
    normalized->>'trackSoundName',
    (normalized->>'sourceTrackIndex')::integer,
    normalized->'chords',
    extensions.crypt(ownership_token, extensions.gen_salt('bf', 10))
  ) returning * into created;
  return private.public_pack_json(created);
end;
$$;

create or replace function public.get_pack(pack_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_pack_json(p)
  from public.chord_packs p
  where p.id = pack_id and not p.hidden and not p.deleted
$$;

create or replace function public.list_packs(
  page_limit integer default 20,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_limit integer := coalesce(page_limit, 20);
  rows public.chord_packs[];
  row_count integer;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  i integer;
begin
  if effective_limit not between 1 and 100 then
    raise exception 'INVALID_PAGE_LIMIT' using errcode = '22023';
  end if;
  if (cursor_created_at is null) <> (cursor_id is null) then
    raise exception 'INVALID_PAGE_CURSOR' using errcode = '22023';
  end if;

  select coalesce(
    array_agg(q.pack_row order by (q.pack_row).created_at desc, (q.pack_row).id desc),
    array[]::public.chord_packs[]
  ) into rows
  from (
    select p as pack_row
    from public.chord_packs p
    where not p.hidden and not p.deleted
      and (
        cursor_created_at is null
        or (p.created_at, p.id) < (cursor_created_at, cursor_id)
      )
    order by p.created_at desc, p.id desc
    limit effective_limit + 1
  ) q;

  row_count := cardinality(rows);
  if row_count > 0 then
    for i in 1..least(row_count, effective_limit) loop
      items := items || jsonb_build_array(private.public_pack_json(rows[i]));
    end loop;
  end if;
  if row_count > effective_limit then
    next_cursor := jsonb_build_object(
      'createdAt', rows[effective_limit].created_at,
      'id', rows[effective_limit].id
    );
  end if;
  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;

create or replace function private.ownership_token_matches(
  ownership_token text,
  ownership_token_hash text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  effective_hash text := coalesce(
    ownership_token_hash,
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'
  );
  calculated_hash text;
begin
  calculated_hash := extensions.crypt(ownership_token, effective_hash);
  return ownership_token_hash is not null
    and calculated_hash = ownership_token_hash;
end;
$$;

create or replace function public.update_pack(
  pack_id uuid,
  payload jsonb,
  ownership_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chord_packs%rowtype;
  target_found boolean;
  token_matches boolean;
  normalized jsonb;
  updated public.chord_packs%rowtype;
begin
  if ownership_token is null or ownership_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_OWNERSHIP_TOKEN' using errcode = '22023';
  end if;
  select * into target
  from public.chord_packs p
  where p.id = pack_id and not p.hidden and not p.deleted
  for update;
  target_found := found;
  token_matches := private.ownership_token_matches(
    ownership_token,
    target.ownership_token_hash
  );
  if not target_found or not token_matches then
    raise exception 'PACK_OWNERSHIP_REJECTED' using errcode = '42501';
  end if;

  normalized := private.normalize_pack_payload(payload);
  update public.chord_packs p set
    pack_name = normalized->>'packName',
    author_name = normalized->>'authorName',
    tags = array(select jsonb_array_elements_text(normalized->'tags')),
    musical_key = normalized->>'key',
    track_sound_name = normalized->>'trackSoundName',
    source_track_index = (normalized->>'sourceTrackIndex')::integer,
    chords = normalized->'chords',
    updated_at = statement_timestamp()
  where p.id = pack_id
  returning * into updated;
  return private.public_pack_json(updated);
end;
$$;

create or replace function public.delete_pack(pack_id uuid, ownership_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chord_packs%rowtype;
  target_found boolean;
  token_matches boolean;
begin
  if ownership_token is null or ownership_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_OWNERSHIP_TOKEN' using errcode = '22023';
  end if;
  select * into target
  from public.chord_packs p
  where p.id = pack_id and not p.hidden and not p.deleted
  for update;
  target_found := found;
  token_matches := private.ownership_token_matches(
    ownership_token,
    target.ownership_token_hash
  );
  if not target_found or not token_matches then
    raise exception 'PACK_OWNERSHIP_REJECTED' using errcode = '42501';
  end if;
  update public.chord_packs p
    set deleted = true, updated_at = statement_timestamp()
    where p.id = pack_id;
end;
$$;

create or replace function public.report_pack(pack_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chord_packs p
    set reported_count = reported_count + 1
    where p.id = pack_id and not p.hidden and not p.deleted;
  if not found then
    raise exception 'PACK_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function private.ownership_token_matches(text,text) from public, anon, authenticated;
revoke execute on function public.create_pack(jsonb,text) from public;
revoke execute on function public.get_pack(uuid) from public;
revoke execute on function public.list_packs(integer,timestamptz,uuid) from public;
revoke execute on function public.update_pack(uuid,jsonb,text) from public;
revoke execute on function public.delete_pack(uuid,text) from public;
revoke execute on function public.report_pack(uuid) from public;
grant execute on function public.create_pack(jsonb,text) to anon, authenticated;
grant execute on function public.get_pack(uuid) to anon, authenticated;
grant execute on function public.list_packs(integer,timestamptz,uuid) to anon, authenticated;
grant execute on function public.update_pack(uuid,jsonb,text) to anon, authenticated;
grant execute on function public.delete_pack(uuid,text) to anon, authenticated;
grant execute on function public.report_pack(uuid) to anon, authenticated;
