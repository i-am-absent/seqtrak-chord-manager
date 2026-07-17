create extension if not exists pgtap with schema extensions;
begin;

create schema test_helpers;

create function test_helpers.valid_pack_payload(pack_name text, author_name text default 'Author')
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'packName', pack_name,
    'authorName', author_name,
    'tags', jsonb_build_array('Jazz'),
    'key', 'C',
    'trackSoundName', 'Warm Pad',
    'sourceTrackIndex', 7,
    'chords', jsonb_build_array(
      jsonb_build_object('slotIndex', 1, 'notes', jsonb_build_array(60), 'displayName', 'C'),
      jsonb_build_object('slotIndex', 2, 'notes', jsonb_build_array(62), 'displayName', 'Dm'),
      jsonb_build_object('slotIndex', 3, 'notes', jsonb_build_array(64), 'displayName', 'Em'),
      jsonb_build_object('slotIndex', 4, 'notes', jsonb_build_array(65), 'displayName', 'F'),
      jsonb_build_object('slotIndex', 5, 'notes', jsonb_build_array(67), 'displayName', 'G'),
      jsonb_build_object('slotIndex', 6, 'notes', jsonb_build_array(69), 'displayName', 'Am'),
      jsonb_build_object('slotIndex', 7, 'notes', jsonb_build_array(71), 'displayName', 'Bdim')
    )
  )
$$;

grant usage on schema test_helpers to anon;
grant execute on function test_helpers.valid_pack_payload(text,text) to anon;

select plan(62);

select has_function('public', 'create_pack', array['jsonb','text']);
select has_function('public', 'get_pack', array['uuid']);
select has_function('public', 'list_packs', array['integer','timestamp with time zone','uuid']);

select is(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.create_pack(jsonb,text)')),
  true
);
select is(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.get_pack(uuid)')),
  true
);
select is(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.list_packs(integer,timestamp with time zone,uuid)')),
  true
);
select is(
  (select proconfig from pg_proc where oid = to_regprocedure('public.create_pack(jsonb,text)')),
  array['search_path=""']::text[]
);
select is(
  (select proconfig from pg_proc where oid = to_regprocedure('public.get_pack(uuid)')),
  array['search_path=""']::text[]
);
select is(
  (select proconfig from pg_proc where oid = to_regprocedure('public.list_packs(integer,timestamp with time zone,uuid)')),
  array['search_path=""']::text[]
);

select ok(not exists (
  select 1
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = 'create_pack'
    and grantee = 'PUBLIC'
    and privilege_type = 'EXECUTE'
));
select ok(not exists (
  select 1
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = 'get_pack'
    and grantee = 'PUBLIC'
    and privilege_type = 'EXECUTE'
));
select ok(not exists (
  select 1
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = 'list_packs'
    and grantee = 'PUBLIC'
    and privilege_type = 'EXECUTE'
));

select ok(coalesce(has_function_privilege('anon', to_regprocedure('public.create_pack(jsonb,text)'), 'execute'), false));
select ok(coalesce(has_function_privilege('anon', to_regprocedure('public.get_pack(uuid)'), 'execute'), false));
select ok(coalesce(has_function_privilege('anon', to_regprocedure('public.list_packs(integer,timestamp with time zone,uuid)'), 'execute'), false));
select ok(coalesce(has_function_privilege('authenticated', to_regprocedure('public.create_pack(jsonb,text)'), 'execute'), false));
select ok(coalesce(has_function_privilege('authenticated', to_regprocedure('public.get_pack(uuid)'), 'execute'), false));
select ok(coalesce(has_function_privilege('authenticated', to_regprocedure('public.list_packs(integer,timestamp with time zone,uuid)'), 'execute'), false));

set local role anon;

select throws_ok(
  $$ insert into public.chord_packs(pack_name,author_name,tags,musical_key,track_sound_name,chords,ownership_token_hash) values ('Denied','A','{}','C','Pad','[]','hash') $$,
  '42501'
);
select throws_ok($$ select * from public.chord_packs $$, '42501');
select throws_ok($$ update public.chord_packs set hidden = true $$, '42501');
select throws_ok($$ delete from public.chord_packs $$, '42501');

select lives_ok($$ select public.create_pack(test_helpers.valid_pack_payload('First'), repeat('a', 64)) $$);
select is(
  (public.create_pack(test_helpers.valid_pack_payload('Anonymous', ''), repeat('b', 64)))->>'authorName',
  'Anonymous'
);
select throws_ok(
  $$ select public.create_pack(test_helpers.valid_pack_payload('Bad'), 'short') $$,
  '22023',
  'INVALID_OWNERSHIP_TOKEN'
);
select throws_ok(
  $$ select public.create_pack(test_helpers.valid_pack_payload('Bad'), repeat('A', 64)) $$,
  '22023',
  'INVALID_OWNERSHIP_TOKEN'
);
select ok(not ((public.create_pack(test_helpers.valid_pack_payload('Safe'), repeat('c', 64))) ? 'ownership_token_hash'));
select is(
  (public.create_pack(test_helpers.valid_pack_payload('Hash'), repeat('d', 64)))->>'packName',
  'Hash'
);

reset role;

select is((select count(*) from public.chord_packs), 4::bigint);
select isnt(
  (select ownership_token_hash from public.chord_packs where pack_name = 'Hash'),
  repeat('d', 64)
);
select is(
  (select extensions.crypt(repeat('d', 64), ownership_token_hash) = ownership_token_hash
   from public.chord_packs where pack_name = 'Hash'),
  true
);

update public.chord_packs
set id = case pack_name
    when 'First' then '00000000-0000-0000-0000-000000000001'::uuid
    when 'Anonymous' then '00000000-0000-0000-0000-000000000002'::uuid
    when 'Safe' then '00000000-0000-0000-0000-000000000003'::uuid
    when 'Hash' then '00000000-0000-0000-0000-000000000004'::uuid
  end,
  created_at = case pack_name
    when 'First' then '2026-07-17 12:02:00+00'::timestamptz
    when 'Anonymous' then '2026-07-17 12:01:00+00'::timestamptz
    when 'Safe' then '2026-07-17 12:01:00+00'::timestamptz
    when 'Hash' then '2026-07-17 12:00:00+00'::timestamptz
  end;

insert into public.chord_packs(
  id, pack_name, author_name, tags, musical_key, track_sound_name, chords,
  ownership_token_hash, hidden, created_at
) values (
  '00000000-0000-0000-0000-000000000005', 'Hidden', 'A', '{}', 'C', 'Pad', '[]',
  'not-a-token', true, '2026-07-17 12:04:00+00'
);
insert into public.chord_packs(
  id, pack_name, author_name, tags, musical_key, track_sound_name, chords,
  ownership_token_hash, deleted, created_at
) values (
  '00000000-0000-0000-0000-000000000006', 'Deleted', 'A', '{}', 'C', 'Pad', '[]',
  'not-a-token', true, '2026-07-17 12:03:00+00'
);

set local role anon;

select is(
  (public.get_pack('00000000-0000-0000-0000-000000000001'::uuid))->>'packName',
  'First'
);
select ok(not (public.get_pack('00000000-0000-0000-0000-000000000001'::uuid) ? 'ownership_token_hash'));
select ok(not (public.get_pack('00000000-0000-0000-0000-000000000001'::uuid) ? 'hidden'));
select ok(not (public.get_pack('00000000-0000-0000-0000-000000000001'::uuid) ? 'deleted'));
select is(public.get_pack('00000000-0000-0000-0000-000000000099'::uuid), null);
select is(public.get_pack('00000000-0000-0000-0000-000000000005'::uuid), null);
select is(public.get_pack('00000000-0000-0000-0000-000000000006'::uuid), null);

select is(jsonb_array_length(public.list_packs()->'items'), 4);
select is(jsonb_array_length(public.list_packs(null, null, null)->'items'), 4);
select ok(not exists (
  select 1 from jsonb_array_elements(public.list_packs()->'items') item
  where item ? 'ownership_token_hash'
));
select ok(not exists (
  select 1 from jsonb_array_elements(public.list_packs()->'items') item
  where item ? 'hidden'
));
select ok(not exists (
  select 1 from jsonb_array_elements(public.list_packs()->'items') item
  where item ? 'deleted'
));
select throws_ok($$ select public.list_packs(0, null, null) $$, '22023', 'INVALID_PAGE_LIMIT');
select throws_ok($$ select public.list_packs(101, null, null) $$, '22023', 'INVALID_PAGE_LIMIT');
select throws_ok(
  $$ select public.list_packs(20, '2026-07-17 12:00:00+00'::timestamptz, null) $$,
  '22023',
  'INVALID_PAGE_CURSOR'
);
select throws_ok(
  $$ select public.list_packs(20, null, '00000000-0000-0000-0000-000000000001'::uuid) $$,
  '22023',
  'INVALID_PAGE_CURSOR'
);

select is(public.list_packs()->'items'->0->>'packName', 'First');
select is(public.list_packs()->'items'->1->>'packName', 'Safe');
select is(public.list_packs()->'items'->2->>'packName', 'Anonymous');
select is(public.list_packs()->'items'->3->>'packName', 'Hash');
select is(jsonb_array_length(public.list_packs(2, null, null)->'items'), 2);
select isnt(public.list_packs(2, null, null)->'nextCursor', null);
select is(public.list_packs(2, null, null)->'items'->0->>'packName', 'First');
select is(public.list_packs(2, null, null)->'items'->1->>'packName', 'Safe');
select is(
  jsonb_array_length(public.list_packs(
    2,
    (public.list_packs(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_packs(2, null, null)->'nextCursor'->>'id')::uuid
  )->'items'),
  2
);
select is(
  public.list_packs(
    2,
    (public.list_packs(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_packs(2, null, null)->'nextCursor'->>'id')::uuid
  )->'items'->0->>'packName',
  'Anonymous'
);
select is(
  public.list_packs(
    2,
    (public.list_packs(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_packs(2, null, null)->'nextCursor'->>'id')::uuid
  )->'items'->1->>'packName',
  'Hash'
);
select is(
  public.list_packs(
    2,
    (public.list_packs(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_packs(2, null, null)->'nextCursor'->>'id')::uuid
  )->'nextCursor',
  'null'::jsonb
);
select is(
  (select jsonb_agg(item->>'packName')
   from (
     select item
     from jsonb_array_elements(public.list_packs(2, null, null)->'items') item
     union all
     select item
     from jsonb_array_elements(public.list_packs(
       2,
       (public.list_packs(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
       (public.list_packs(2, null, null)->'nextCursor'->>'id')::uuid
     )->'items') item
   ) pages),
  '["First", "Safe", "Anonymous", "Hash"]'::jsonb
);
select ok(not (public.list_packs()->'items' @> '[{"packName":"Hidden"}]'::jsonb));
select ok(not (public.list_packs()->'items' @> '[{"packName":"Deleted"}]'::jsonb));

reset role;
select * from finish();
rollback;
