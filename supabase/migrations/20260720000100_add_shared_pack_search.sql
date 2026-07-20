create or replace function public.search_packs(
  page_limit integer default 20,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  query_text text default null,
  author_text text default null,
  musical_key text default null,
  required_tags text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_limit integer := coalesce(page_limit, 20);
  normalized_query text := nullif(btrim(query_text, ' '), '');
  normalized_author text := nullif(btrim(author_text, ' '), '');
  normalized_tags text[] := coalesce(required_tags, array[]::text[]);
  escaped_query text;
  escaped_author text;
  rows public.chord_packs[];
  row_count integer;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  tag_value text;
  normalized_tag_value text;
  normalized_tag_keys text[] := array[]::text[];
  i integer;
begin
  if effective_limit not between 1 and 100 then
    raise exception 'INVALID_PAGE_LIMIT' using errcode = '22023';
  end if;
  if (cursor_created_at is null) <> (cursor_id is null) then
    raise exception 'INVALID_PAGE_CURSOR' using errcode = '22023';
  end if;
  if normalized_query is not null and char_length(normalized_query) > 100 then
    raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
  end if;
  if normalized_author is not null and char_length(normalized_author) > 50 then
    raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
  end if;
  if musical_key is not null and not (musical_key = any(
    array['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
  )) then
    raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
  end if;
  if cardinality(normalized_tags) > 10 then
    raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
  end if;
  foreach tag_value in array normalized_tags loop
    if tag_value is null then
      raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
    end if;
    normalized_tag_value := btrim(tag_value, ' ');
    if char_length(normalized_tag_value) not between 1 and 30
       or lower(normalized_tag_value) = any(normalized_tag_keys) then
      raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
    end if;
    normalized_tag_keys := array_append(normalized_tag_keys, lower(normalized_tag_value));
  end loop;

  escaped_query := replace(replace(replace(normalized_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  escaped_author := replace(replace(replace(normalized_author, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  select coalesce(
    array_agg(q.pack_row order by (q.pack_row).created_at desc, (q.pack_row).id desc),
    array[]::public.chord_packs[]
  ) into rows
  from (
    select p as pack_row
    from public.chord_packs p
    where not p.hidden and not p.deleted
      and (cursor_created_at is null or (p.created_at, p.id) < (cursor_created_at, cursor_id))
      and (
        normalized_query is null
        or p.pack_name ilike '%' || escaped_query || '%' escape E'\\'
        or p.author_name ilike '%' || escaped_query || '%' escape E'\\'
        or exists (
          select 1 from unnest(p.tags) stored_tag
          where stored_tag ilike '%' || escaped_query || '%' escape E'\\'
        )
      )
      and (
        normalized_author is null
        or p.author_name ilike '%' || escaped_author || '%' escape E'\\'
      )
      and (musical_key is null or p.musical_key = musical_key)
      and not exists (
        select 1 from unnest(normalized_tag_keys) required_tag
        where not exists (
          select 1 from unnest(p.tags) stored_tag
          where lower(stored_tag) = required_tag
        )
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

revoke execute on function public.search_packs(integer,timestamptz,uuid,text,text,text,text[]) from public;
grant execute on function public.search_packs(integer,timestamptz,uuid,text,text,text,text[]) to anon, authenticated;
