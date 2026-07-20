# Shared Pack Search and Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side shared-pack search by pack name, author, and tags plus dedicated author, chromatic Pack Key, and required-tag filters while preserving cursor pagination and existing load/delete behavior.

**Architecture:** Keep the backward-compatible `list_packs` path for unfiltered browsing and add a security-definer `search_packs` RPC for active filters. Extend the repository with typed search options, isolate controlled filter inputs in `SharedPackFilters`, and let `SharedPackBrowser` retain ownership of committed filters, request generations, pagination, deletion suppression, and result states.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP, TypeScript, React, Vitest, Testing Library, CSS, Vite.

## Global Constraints

- Combined search covers pack name, author name, and tags only; it does not search track sound names or chord display names.
- Combined search and dedicated author filtering use case-insensitive substring matching.
- Pack Key is one optional exact `KeyName` value from the existing twelve chromatic notes; Major/Minor is not stored or filtered.
- Required tags use case-insensitive exact matching and AND semantics, with at most ten unique tags of at most 30 Unicode code points each.
- Text fields commit after 300 milliseconds; Key and tag changes commit immediately.
- SQL pattern characters `%`, `_`, and backslash are literals, not wildcards.
- Filter changes reset pagination; refresh and append preserve the committed filter snapshot.
- `hidden` and `deleted` rows never appear.
- The existing `list_packs` RPC signature and unfiltered behavior remain unchanged.
- No new runtime dependency, full-text extension, URL persistence, tag-suggestion endpoint, result count, or alternate sorting is added.

---

## File Structure

- Create `supabase/migrations/20260720000100_add_shared_pack_search.sql`: define, secure, revoke, and grant the new `search_packs` RPC.
- Modify `supabase/tests/02_public_pack_rpcs.test.sql`: assert search semantics, validation, pagination, visibility, and privileges.
- Modify `src/sharing/types.ts`: define normalized search option types.
- Modify `src/sharing/packRepository.ts`: add `searchPacks` to the repository boundary.
- Modify `src/sharing/supabasePackRepository.ts`: normalize filters, invoke `search_packs`, and reuse strict page parsing.
- Modify `src/sharing/supabasePackRepository.test.ts`: verify RPC mapping, parsing, and safe failures.
- Create `src/components/SharedPackFilters.tsx`: controlled accessible draft inputs and tag-chip interactions.
- Create `src/components/SharedPackFilters.test.tsx`: verify input, IME, tag, clear, and accessibility behavior.
- Modify `src/components/SharedPackBrowser.tsx`: own committed filters and filtered request lifecycle.
- Modify `src/components/SharedPackBrowser.test.tsx`: cover debounce, routing, pagination, stale requests, empty/error states, and regressions.
- Modify `src/App.test.tsx`: update repository fakes to satisfy the extended interface and retain App regressions.
- Modify `src/styles.css`: add responsive filter layout, chips, and updating-state presentation.
- Modify `src/styles.test.ts`: lock the responsive/accessibility-related CSS contracts.
- Create `docs/manual-tests/shared-pack-search-filters.md`: record production browser checks.

---

### Task 1: Add the Secure Search RPC

**Files:**
- Create: `supabase/migrations/20260720000100_add_shared_pack_search.sql`
- Modify: `supabase/tests/02_public_pack_rpcs.test.sql`

**Interfaces:**
- Consumes: `private.public_pack_json(public.chord_packs)` and the existing `{items,nextCursor}` JSON page contract.
- Produces: `public.search_packs(integer,timestamptz,uuid,text,text,text,text[]) returns jsonb` with argument order `page_limit, cursor_created_at, cursor_id, query_text, author_text, musical_key, required_tags`.

- [ ] **Step 1: Extend the pgTAP plan and write failing security/contract tests**

Increase the plan count by the exact number of assertions added. Add assertions alongside the existing `list_packs` function-security tests:

```sql
select has_function(
  'public',
  'search_packs',
  array['integer','timestamp with time zone','uuid','text','text','text','text[]']
);
select is(
  (select prosecdef from pg_proc where oid = to_regprocedure(
    'public.search_packs(integer,timestamp with time zone,uuid,text,text,text,text[])'
  )),
  true
);
select is(
  (select proconfig from pg_proc where oid = to_regprocedure(
    'public.search_packs(integer,timestamp with time zone,uuid,text,text,text,text[])'
  )),
  array['search_path=']::text[]
);
select ok(not coalesce(has_function_privilege(
  'public',
  to_regprocedure('public.search_packs(integer,timestamp with time zone,uuid,text,text,text,text[])'),
  'execute'
), false));
select ok(coalesce(has_function_privilege(
  'anon',
  to_regprocedure('public.search_packs(integer,timestamp with time zone,uuid,text,text,text,text[])'),
  'execute'
), false));
select ok(coalesce(has_function_privilege(
  'authenticated',
  to_regprocedure('public.search_packs(integer,timestamp with time zone,uuid,text,text,text,text[])'),
  'execute'
), false));
```

- [ ] **Step 2: Write failing search behavior tests**

Add purpose-built rows before `set local role anon`, including mixed-case authors/tags, literal `%`, `_`, and backslash characters, a track-sound-only term, a chord-name-only term, and hidden/deleted matches. Then add assertions in the anon block using named argument calls so each condition is unambiguous:

```sql
select is(
  (public.search_packs(query_text => 'FIRST')->'items'->0->>'packName'),
  'First'
);
select is(
  jsonb_array_length(public.search_packs(query_text => 'ada')->'items'),
  1
);
select is(
  jsonb_array_length(public.search_packs(query_text => 'BRIGHT')->'items'),
  1
);
select is(
  jsonb_array_length(public.search_packs(author_text => 'dA')->'items'),
  1
);
select is(
  jsonb_array_length(public.search_packs(musical_key => 'C')->'items'),
  3
);
select is(
  jsonb_array_length(public.search_packs(required_tags => array['POP','bright'])->'items'),
  1
);
select is(
  jsonb_array_length(public.search_packs(
    query_text => 'safe', author_text => 'ada', musical_key => 'C',
    required_tags => array['pop']
  )->'items'),
  1
);
select is(jsonb_array_length(public.search_packs(query_text => '%')->'items'), 1);
select is(jsonb_array_length(public.search_packs(query_text => '_')->'items'), 1);
select is(jsonb_array_length(public.search_packs(query_text => E'\\')->'items'), 1);
select is(jsonb_array_length(public.search_packs(query_text => 'sound-only')->'items'), 0);
select is(jsonb_array_length(public.search_packs(query_text => 'chord-only')->'items'), 0);
select ok(not (public.search_packs(query_text => 'hidden-match')->'items' @> '[{"packName":"Hidden Search"}]'::jsonb));
select ok(not (public.search_packs(query_text => 'deleted-match')->'items' @> '[{"packName":"Deleted Search"}]'::jsonb));
```

Use fixture-specific expected counts after inserting the rows; do not weaken assertions to `> 0` when an exact set is known.

- [ ] **Step 3: Write failing validation and cursor tests**

Cover every invalid boundary and collect two pages under the same filter:

```sql
select throws_ok($$ select public.search_packs(page_limit => 0) $$, '22023', 'INVALID_PAGE_LIMIT');
select throws_ok($$ select public.search_packs(page_limit => 101) $$, '22023', 'INVALID_PAGE_LIMIT');
select throws_ok(
  $$ select public.search_packs(cursor_created_at => now()) $$,
  '22023', 'INVALID_PAGE_CURSOR'
);
select throws_ok(
  $$ select public.search_packs(query_text => repeat('x', 101)) $$,
  '22023', 'INVALID_SEARCH_FILTER'
);
select throws_ok(
  $$ select public.search_packs(author_text => repeat('x', 51)) $$,
  '22023', 'INVALID_SEARCH_FILTER'
);
select throws_ok(
  $$ select public.search_packs(musical_key => 'Db') $$,
  '22023', 'INVALID_SEARCH_FILTER'
);
select throws_ok(
  $$ select public.search_packs(required_tags => array['pop','POP']) $$,
  '22023', 'INVALID_SEARCH_FILTER'
);
select throws_ok(
  $$ select public.search_packs(required_tags => array_fill('x'::text, array[11])) $$,
  '22023', 'INVALID_SEARCH_FILTER'
);
select throws_ok(
  $$ select public.search_packs(required_tags => array['']) $$,
  '22023', 'INVALID_SEARCH_FILTER'
);
```

For pagination, request `page_limit => 2` with a shared query/tag fixture, pass the returned `createdAt` and `id` into the second call, and assert ordered concatenation contains every expected ID exactly once and the last page has JSON `null` cursor.

- [ ] **Step 4: Run the database tests to verify they fail**

Run:

```bash
npm run supabase:start
npm run test:db
```

Expected: pgTAP fails because `public.search_packs` does not exist. If Docker or the local Supabase stack is unavailable, record the exact environmental blocker; do not mark this step passing.

- [ ] **Step 5: Implement the migration**

Create the new migration with this shape. Keep all object/function references schema-qualified:

```sql
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
```

- [ ] **Step 6: Reset the database and run pgTAP**

Run:

```bash
npm run db:reset
npm run test:db
```

Expected: reset succeeds and every pgTAP assertion passes.

- [ ] **Step 7: Commit the RPC slice**

```bash
git add supabase/migrations/20260720000100_add_shared_pack_search.sql supabase/tests/02_public_pack_rpcs.test.sql
git commit -m "feat: add shared pack search rpc"
```

---

### Task 2: Add Typed Repository Search

**Files:**
- Modify: `src/sharing/types.ts`
- Modify: `src/sharing/packRepository.ts`
- Modify: `src/sharing/supabasePackRepository.ts`
- Modify: `src/sharing/supabasePackRepository.test.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/components/SharedPackBrowser.test.tsx`

**Interfaces:**
- Consumes: Task 1 `search_packs(page_limit,cursor_created_at,cursor_id,query_text,author_text,musical_key,required_tags)`.
- Produces: `SearchPackFilters`, `SearchPackOptions`, and `PackRepository.searchPacks(options: SearchPackOptions): Promise<PackPage>`.

- [ ] **Step 1: Add failing repository mapping tests**

Add tests proving trimming, inactive values, tag copying, and cursor mapping:

```ts
it("maps normalized search filters and cursor to search_packs", async () => {
  const { client, repository } = setup();
  const cursor = { createdAt: "2026-07-17T00:00:00.000Z", id: publicPack.id };
  client.responses.push({ data: { items: [publicPack], nextCursor: null }, error: null });

  await expect(repository.searchPacks({
    limit: 20,
    cursor,
    query: "  warm  ",
    author: " Ada ",
    key: "C",
    tags: [" pop ", "BRIGHT"],
  })).resolves.toEqual({ items: [publicPack], nextCursor: null });

  expect(client.calls).toEqual([{
    name: "search_packs",
    args: {
      page_limit: 20,
      cursor_created_at: cursor.createdAt,
      cursor_id: cursor.id,
      query_text: "warm",
      author_text: "Ada",
      musical_key: "C",
      required_tags: ["pop", "BRIGHT"],
    },
  }]);
});

it("maps inactive optional filters to undefined rpc arguments", async () => {
  const { client, repository } = setup();
  client.responses.push({ data: { items: [], nextCursor: null }, error: null });
  await repository.searchPacks({ query: "   ", author: "", tags: [] });
  expect(client.calls[0]).toEqual({
    name: "search_packs",
    args: {
      page_limit: undefined,
      cursor_created_at: undefined,
      cursor_id: undefined,
      query_text: undefined,
      author_text: undefined,
      musical_key: undefined,
      required_tags: undefined,
    },
  });
});
```

Also assert malformed search pages throw `SharingResponseError` and SQLSTATE `22023` maps to `SharingValidationError` without returning raw service data.

- [ ] **Step 2: Run the repository test to verify it fails**

Run:

```bash
npx vitest run --config vite.config.ts src/sharing/supabasePackRepository.test.ts
```

Expected: TypeScript/test failure because `searchPacks` and search option types do not exist.

- [ ] **Step 3: Add the search types and interface**

Append to `src/sharing/types.ts`:

```ts
export interface SearchPackFilters {
  query?: string;
  author?: string;
  key?: KeyName;
  tags?: string[];
}

export interface SearchPackOptions extends SearchPackFilters {
  limit?: number;
  cursor?: PackCursor;
}
```

Add to `PackRepository`:

```ts
searchPacks(options: SearchPackOptions): Promise<PackPage>;
```

Import `SearchPackOptions` from `./types` in both repository files.

- [ ] **Step 4: Implement repository normalization and RPC mapping**

Add a U+0020-only helper so normalization matches the design and database:

```ts
function trimAsciiSpaces(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/^ +| +$/g, "");
  return normalized || undefined;
}
```

Add this method to `SupabasePackRepository`:

```ts
async searchPacks(options: SearchPackOptions): Promise<PackPage> {
  const tags = options.tags
    ?.map((tag) => trimAsciiSpaces(tag))
    .filter((tag): tag is string => tag !== undefined);
  const data = await this.call("search_packs", {
    page_limit: options.limit,
    cursor_created_at: options.cursor?.createdAt,
    cursor_id: options.cursor?.id,
    query_text: trimAsciiSpaces(options.query),
    author_text: trimAsciiSpaces(options.author),
    musical_key: options.key,
    required_tags: tags?.length ? [...tags] : undefined,
  });
  return parsePage(data);
}
```

Update every structural `PackRepository` fake in component/App tests with `searchPacks: vi.fn()` so compilation remains strict.

- [ ] **Step 5: Run focused repository and type-dependent tests**

Run:

```bash
npx vitest run --config vite.config.ts src/sharing/supabasePackRepository.test.ts src/components/SharedPackBrowser.test.tsx src/App.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit the repository slice**

```bash
git add src/sharing/types.ts src/sharing/packRepository.ts src/sharing/supabasePackRepository.ts src/sharing/supabasePackRepository.test.ts src/components/SharedPackBrowser.test.tsx src/App.test.tsx
git commit -m "feat: add shared pack search repository"
```

---

### Task 3: Build Accessible Filter Controls

**Files:**
- Create: `src/components/SharedPackFilters.tsx`
- Create: `src/components/SharedPackFilters.test.tsx`

**Interfaces:**
- Consumes: existing `chromaticKeys` and Task 2 `SearchPackFilters`.
- Produces: controlled `SharedPackFilters` component with draft text callbacks, immediate Key/tag callbacks, IME composition callbacks, and clear action.

- [ ] **Step 1: Write failing filter-control tests**

Create tests with a render harness that owns the controlled value. Cover persistent labels, all twelve keys, Add/Enter, blank/duplicate suppression, chip removal, clear disabling, and IME callbacks. The central interaction test should include:

```tsx
it("adds normalized unique tags and removes them accessibly", async () => {
  const onChange = vi.fn();
  const filters = { tags: ["pop"] };
  render(
    <SharedPackFilters
      queryDraft=""
      authorDraft=""
      filters={{ tags: ["pop"] }}
      composing={false}
      onQueryDraftChange={vi.fn()}
      onAuthorDraftChange={vi.fn()}
      onCompositionChange={vi.fn()}
      onFiltersChange={onChange}
      onClear={vi.fn()}
    />,
  );
  await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "  BRIGHT  ");
  await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
  expect(onChange).toHaveBeenCalledWith({ ...filters, tags: ["pop", "BRIGHT"] });
  await userEvent.click(screen.getByRole("button", { name: "Remove tag pop" }));
  expect(onChange).toHaveBeenCalledWith({ ...filters, tags: [] });
});
```

Dispatch `compositionStart` and `compositionEnd` on each text input and assert `onCompositionChange(true/false)` is emitted without modifying filter state directly.

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackFilters.test.tsx
```

Expected: FAIL because `SharedPackFilters.tsx` does not exist.

- [ ] **Step 3: Implement the controlled component**

Use this public contract:

```ts
interface SharedPackFiltersProps {
  queryDraft: string;
  authorDraft: string;
  filters: SearchPackFilters;
  composing: boolean;
  onQueryDraftChange: (value: string) => void;
  onAuthorDraftChange: (value: string) => void;
  onCompositionChange: (composing: boolean) => void;
  onFiltersChange: (filters: SearchPackFilters) => void;
  onClear: () => void;
}
```

The component owns only `tagDraft`. Normalize tag additions with U+0020 trimming, compare duplicates using `toLowerCase()`, cap UI additions at ten, and emit cloned arrays. Define the local behavior before rendering:

```tsx
const [tagDraft, setTagDraft] = useState("");
const tags = filters.tags ?? [];
const addTag = () => {
  const tag = tagDraft.replace(/^ +| +$/g, "");
  if (
    !tag ||
    [...tag].length > 30 ||
    tags.length >= 10 ||
    tags.some((current) => current.toLowerCase() === tag.toLowerCase())
  ) return;
  onFiltersChange({ ...filters, tags: [...tags, tag] });
  setTagDraft("");
};
const hasValues = Boolean(
  queryDraft || authorDraft || filters.key || tags.length,
);
```

Render the complete form:

```tsx
<form className="shared-filters" onSubmit={(event) => event.preventDefault()}>
  <label>
    Search packs
    <input
      type="search"
      value={queryDraft}
      onChange={(event) => onQueryDraftChange(event.target.value)}
      onCompositionStart={() => onCompositionChange(true)}
      onCompositionEnd={() => onCompositionChange(false)}
    />
  </label>
  <label>
    Author
    <input
      value={authorDraft}
      onChange={(event) => onAuthorDraftChange(event.target.value)}
      onCompositionStart={() => onCompositionChange(true)}
      onCompositionEnd={() => onCompositionChange(false)}
    />
  </label>
  <label>
    Pack Key
    <select
      value={filters.key ?? ""}
      onChange={(event) => onFiltersChange({
        ...filters,
        key: event.target.value ? event.target.value as KeyName : undefined,
      })}
    >
      <option value="">All Keys</option>
      {chromaticKeys.map((key) => <option key={key} value={key}>{key}</option>)}
    </select>
  </label>
  <div className="shared-tag-filter">
    <label>
      Tags
      <input
        value={tagDraft}
        maxLength={30}
        onChange={(event) => setTagDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addTag();
          }
        }}
      />
    </label>
    <button type="button" onClick={addTag}>Add tag</button>
  </div>
  <div className="shared-filter-chips" aria-label="Required tags">
    {tags.map((tag) => (
      <span className="shared-filter-chip" key={tag.toLowerCase()}>
        <span>{tag}</span>
        <button
          type="button"
          aria-label={`Remove tag ${tag}`}
          onClick={() => onFiltersChange({
            ...filters,
            tags: tags.filter((current) => current !== tag),
          })}
        >
          ×
        </button>
      </span>
    ))}
  </div>
  <button type="button" disabled={!hasValues} onClick={onClear}>
    Clear filters
  </button>
</form>
```

- [ ] **Step 4: Run focused component tests**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackFilters.test.tsx
```

Expected: all filter-control tests pass without React act warnings.

- [ ] **Step 5: Commit the filter controls**

```bash
git add src/components/SharedPackFilters.tsx src/components/SharedPackFilters.test.tsx
git commit -m "feat: add shared pack filter controls"
```

---

### Task 4: Integrate Filtered Request State and Pagination

**Files:**
- Modify: `src/components/SharedPackBrowser.tsx`
- Modify: `src/components/SharedPackBrowser.test.tsx`

**Interfaces:**
- Consumes: Task 2 `PackRepository.searchPacks`, `SearchPackFilters`, `SearchPackOptions`; Task 3 `SharedPackFilters` props.
- Produces: debounced, generation-safe filtered list behavior while preserving load/delete callbacks.

- [ ] **Step 1: Write failing routing and debounce tests**

Use fake timers only within debounce tests and restore real timers afterward. Assert initial load uses `listPacks`, typing does not call search before 299ms, and 300ms commits normalized text:

```tsx
it("debounces combined and author text before server search", async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const repository = fakeRepository(vi.fn().mockResolvedValue({ items: [], nextCursor: null }), {
    searchPacks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  });
  renderBrowser(repository);
  await act(async () => vi.runOnlyPendingTimers());
  await user.type(screen.getByRole("searchbox", { name: "Search packs" }), "warm");
  await user.type(screen.getByRole("textbox", { name: "Author" }), "Ada");
  act(() => vi.advanceTimersByTime(299));
  expect(repository.searchPacks).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(repository.searchPacks).toHaveBeenLastCalledWith({
    limit: 20, query: "warm", author: "Ada", tags: [],
  });
  vi.useRealTimers();
});
```

Add separate tests for IME composition deferral, immediate Key/tag application, duplicate tag suppression, chip removal, and clear returning to `listPacks({limit: 20})`.

- [ ] **Step 2: Write failing pagination, refresh, stale, and presentation tests**

Add tests that prove:

- `Load more` calls `searchPacks({...filters, limit: 20, cursor})`;
- `Refresh` calls `searchPacks({...filters, limit: 20})` without cursor;
- a filter change invalidates an older unfiltered success/failure and an older filtered append success/failure;
- cards remain visible with `Updating shared packs…` during replacement;
- zero filtered results show `No shared packs match these filters.`;
- retry repeats the same committed filters;
- deleting a filtered card suppresses it from overlapping refresh/append responses;
- `Load into editor` still receives the original `PublicPack`.

- [ ] **Step 3: Run browser tests to verify they fail**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackBrowser.test.tsx
```

Expected: new tests fail because the browser neither renders filters nor calls `searchPacks`.

- [ ] **Step 4: Add committed filter state and repository routing**

Add state and helpers near the existing list state:

```ts
const [queryDraft, setQueryDraft] = useState("");
const [authorDraft, setAuthorDraft] = useState("");
const [filters, setFilters] = useState<SearchPackFilters>({ tags: [] });
const [composing, setComposing] = useState(false);

function hasActiveFilters(value: SearchPackFilters): boolean {
  return Boolean(value.query || value.author || value.key || value.tags?.length);
}

const requestPage = useCallback((
  repository: PackRepository,
  committed: SearchPackFilters,
  cursor?: PackCursor,
) => {
  const options = { ...committed, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) };
  return hasActiveFilters(committed)
    ? repository.searchPacks(options)
    : repository.listPacks({ limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
}, []);
```

Make `loadFirstPage` accept or close over an explicit committed snapshot and route through `requestPage`. Make `loadMore`, refresh, and retry copy the same `filters` snapshot. Preserve the existing generation and synchronous in-flight guards.

- [ ] **Step 5: Add the 300ms text commit effect and filter controls**

Add an effect that does nothing during composition, clears its timeout on dependency changes/unmount, normalizes U+0020 edges, and updates only changed committed text:

```ts
useEffect(() => {
  if (composing) return;
  const timeout = window.setTimeout(() => {
    const query = queryDraft.replace(/^ +| +$/g, "") || undefined;
    const author = authorDraft.replace(/^ +| +$/g, "") || undefined;
    setFilters((current) =>
      current.query === query && current.author === author
        ? current
        : { ...current, query, author }
    );
  }, 300);
  return () => window.clearTimeout(timeout);
}, [authorDraft, composing, queryDraft]);
```

Render `SharedPackFilters` below the header. On immediate filter change, clone tags and update `filters`. On clear, set both drafts to empty and filters to `{tags: []}` in the same event. Ensure a committed-filter effect advances the request generation and starts exactly one replacement request; do not trigger an additional request merely because drafts clear.

- [ ] **Step 6: Preserve cards during filtered replacement and distinguish empty states**

Render the existing grid whenever `items.length > 0`, including replacement loading/error. Add:

```tsx
{replaceState === "loading" && items.length > 0 ? (
  <p className="shared-updating" role="status">Updating shared packs…</p>
) : null}
{replaceState === "ready" && items.length === 0 && !nextCursor ? (
  <p>{hasActiveFilters(filters) ? "No shared packs match these filters." : "No shared packs yet."}</p>
) : null}
```

On replacement failure with existing cards, show the alert and retry without discarding cards. Keep deleted-ID filtering in both replace and append success paths.

- [ ] **Step 7: Run focused browser, filter, and App tests**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackFilters.test.tsx src/components/SharedPackBrowser.test.tsx src/App.test.tsx
```

Expected: all focused tests pass; no new act warnings are introduced.

- [ ] **Step 8: Commit the integrated browser behavior**

```bash
git add src/components/SharedPackBrowser.tsx src/components/SharedPackBrowser.test.tsx
git commit -m "feat: filter shared pack browser"
```

---

### Task 5: Responsive Styling, Manual Checks, and Release Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`
- Create: `docs/manual-tests/shared-pack-search-filters.md`

**Interfaces:**
- Consumes: Task 3 `.shared-filters`, `.shared-filter-fields`, `.shared-tag-filter`, `.shared-filter-chips`, `.shared-filter-chip`; Task 4 `.shared-updating`.
- Produces: responsive filter presentation and a reproducible manual verification checklist.

- [ ] **Step 1: Write failing CSS contract tests**

Add assertions using the existing stylesheet text helpers for:

```ts
expect(styles).toMatch(/\.shared-filter-fields\s*{[^}]*display:\s*grid/);
expect(styles).toMatch(/\.shared-filter-chips\s*{[^}]*flex-wrap:\s*wrap/);
expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.shared-filter-fields\s*{[^}]*grid-template-columns:\s*1fr/);
expect(styles).toMatch(/\.shared-filter-chip\s*{[^}]*border-radius:\s*999px/);
```

- [ ] **Step 2: Run the style test to verify it fails**

Run:

```bash
npx vitest run --config vite.config.ts src/styles.test.ts
```

Expected: FAIL because the filter selectors do not exist.

- [ ] **Step 3: Add responsive filter styles**

Add desktop grid, labeled control, chip, tag row, and updating styles:

```css
.shared-filters {
  background: #f8fafc;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.shared-filter-fields {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(180px, 2fr) minmax(160px, 1fr) minmax(120px, auto);
}

.shared-filter-fields label,
.shared-tag-filter label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.shared-filter-fields input,
.shared-filter-fields select,
.shared-tag-filter input {
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  min-height: 38px;
  min-width: 0;
  padding: 7px 9px;
}

.shared-tag-filter,
.shared-filter-chips {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.shared-filter-chip {
  align-items: center;
  background: #e8eefc;
  border-radius: 999px;
  display: inline-flex;
  gap: 6px;
  padding: 4px 8px;
}

.shared-updating {
  color: #4b5565;
  margin: 0;
}

@media (max-width: 640px) {
  .shared-filter-fields {
    grid-template-columns: 1fr;
  }
}
```

Keep buttons at least 38px high and ensure long tags wrap without horizontal page overflow.

- [ ] **Step 4: Write the manual verification document**

Create `docs/manual-tests/shared-pack-search-filters.md` with exact checks:

```markdown
# Shared Pack Search and Filters Manual Verification

1. Open Shared Packs and confirm the newest unfiltered page loads.
2. Type a pack-name fragment; confirm no request/result change before 300 ms and matching cards appear afterward.
3. Repeat with an author fragment and a tag fragment in the combined search.
4. Enter Japanese text through IME and confirm no partial composition result is requested.
5. Set Author and one Pack Key; confirm both conditions apply.
6. Add two tags with Enter/Add and confirm only packs containing both remain.
7. Remove one tag chip, refresh, and load another page; confirm the remaining filters persist.
8. Search for literal `%`, `_`, and `\`; confirm they do not behave as wildcards.
9. Clear filters and confirm the unfiltered newest page returns.
10. At 640px and 375px widths, confirm controls stack, chips wrap, and every action remains keyboard operable.
11. While filtered, load a pack into the Editor and delete an owned pack; confirm existing behavior remains intact.
```

- [ ] **Step 5: Run all automated verification**

Run:

```bash
npm test -- --reporter=dot
npm run test:deployment
npm run test:server
npm run db:reset
npm run test:db
npm run build
git diff --check
```

Expected: all frontend, deployment, static-server, database, and build checks pass; `git diff --check` prints no errors. Existing known React act warnings may be recorded, but no new warning introduced by this feature is acceptable.

- [ ] **Step 6: Audit scope and security**

Run:

```bash
grep -RInE "service.role|service_role|ownership_token|search_path" src .github/workflows supabase/migrations/20260720000100_add_shared_pack_search.sql
git status --short
git diff --stat HEAD~4
```

Expected: no privileged key or ownership token is added to frontend/workflow inputs; the new RPC has `set search_path = ''`; only planned feature files are modified.

- [ ] **Step 7: Commit presentation and verification docs**

```bash
git add src/styles.css src/styles.test.ts docs/manual-tests/shared-pack-search-filters.md
git commit -m "style: present shared pack filters responsively"
```

- [ ] **Step 8: Perform the manual browser checklist**

Run `npm run dev`, execute every step in `docs/manual-tests/shared-pack-search-filters.md`, and record any device/browser-independent discrepancy before considering the feature complete. Do not claim this step passed without actually performing the browser interactions.
