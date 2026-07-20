# Shared Pack Search and Filters Design

## Goal

Allow users to search and filter the complete public shared-pack collection without weakening the existing newest-first cursor pagination, editor loading, or owned-pack deletion behavior.

## Scope

Included:

- a combined text search over pack name, author name, and tags;
- a dedicated author-name filter;
- one optional twelve-note Pack Key filter;
- one or more user-entered tag filters combined with AND semantics;
- automatic application after a short text-input debounce;
- server-side filtering over all visible public packs;
- filtered cursor pagination, refresh, loading, empty, error, and retry states;
- responsive and accessible filter controls.

Excluded:

- Major or Minor mode as pack metadata or a filter;
- search over track sound names or chord display names;
- tag suggestion, autocomplete, or a global distinct-tag endpoint;
- alternate sorting, popularity ranking, or result counts;
- URL persistence or cross-session persistence of filters;
- fuzzy matching, stemming, language-aware tokenization, or full-text ranking.

The Pack Key filter uses the existing `KeyName` values `C` through `B`. The transient Major/Minor recommendation mode is not stored in a shared pack and does not participate in filtering.

## API Strategy

The existing `list_packs` RPC remains unchanged for backward compatibility and for the unfiltered newest-pack view. A new `search_packs` RPC handles every request with at least one active search condition.

`PackRepository` adds a search boundary conceptually equivalent to:

```ts
searchPacks(options: SearchPackOptions): Promise<PackPage>
```

`SearchPackOptions` contains:

- `limit?: number`;
- `cursor?: PackCursor`;
- `query?: string`;
- `author?: string`;
- `key?: KeyName`;
- `tags?: string[]`.

The repository removes leading and trailing U+0020 spaces from text filters, sends the normalized values to `search_packs`, and validates its response through the same strict `PackPage` parser used by `listPacks`. Empty strings and an empty tag array are omitted or sent as null-equivalent inactive conditions. `SharedPackBrowser` calls `listPacks` only when all conditions are inactive and `searchPacks` otherwise.

## Search Semantics

All active condition types combine with AND semantics.

### Combined text search

`query` matches when at least one of these fields contains the entered text:

- pack name;
- author name;
- any tag.

Matching is case-insensitive substring matching.

### Author filter

`author` performs case-insensitive substring matching against author name only. When both `query` and `author` are active, the record must satisfy both conditions.

### Pack Key filter

`key` performs exact matching against one of the twelve existing chromatic `KeyName` values. An `All Keys` UI value makes this condition inactive. Major and Minor are not represented.

### Tag filters

Every entered tag must match one stored tag case-insensitively. Multiple tags therefore use AND semantics. Tag matching is exact after case folding rather than substring matching.

Duplicate entered tags are suppressed case-insensitively. Leading and trailing whitespace is removed before a tag becomes active. An empty normalized tag is not added.

### Literal matching and validation

User-entered `%`, `_`, and the SQL pattern escape character are treated as literal text, not wildcard syntax. The database function escapes these values before `ILIKE` matching.

The RPC validates:

- page limit from 1 through 100;
- cursor timestamp and ID supplied together;
- query as no more than 100 Unicode code points and author as no more than 50 Unicode code points after U+0020 normalization;
- key as one of the twelve `KeyName` values;
- no more than ten unique, non-empty tag filters;
- each tag within the existing 30-code-point tag limit.

Invalid filter arguments raise `INVALID_SEARCH_FILTER` with SQLSTATE `22023`. Hidden and deleted packs are always excluded.

## Ordering and Pagination

Search results use the existing deterministic order:

1. `created_at DESC`;
2. `id DESC`.

The cursor retains the existing `{ createdAt, id }` shape. A cursor is valid only with the exact filter snapshot that produced it. The UI enforces this by clearing the cursor and returning to the first page whenever a condition changes.

`Load more` sends the current committed filter snapshot and cursor. `Refresh` sends the same committed filters without a cursor and replaces the current results.

## User Interface

`SharedPackBrowser` adds a filter panel below its heading and description.

Controls:

- `Search packs`: text input for combined pack-name, author-name, and tag search;
- `Author`: text input for author-only filtering;
- `Pack Key`: single-select control containing `All Keys` and the twelve chromatic keys;
- `Tags`: text input with an Add action; Enter also adds the normalized value;
- removable tag chips for every active tag;
- `Clear filters`, disabled when no condition is active.

The text fields commit after 300 milliseconds without another input change. Key changes, tag additions, tag removals, and `Clear filters` commit immediately. Text composition is allowed to finish before the debounce-driven search is committed so Japanese IME input does not issue partial searches.

While a replacement request is running, existing cards remain visible and a nearby status indicates that results are updating. This avoids clearing useful content during debounced searches. The initial unfiltered load retains the existing full loading state.

When an active filter returns no records, the browser displays `No shared packs match these filters.` This is distinct from the unfiltered `No shared packs yet.` state.

On narrow screens, controls stack vertically and tag chips wrap. Every input has a persistent label. Tag removal buttons include the tag name in their accessible label. Loading changes use status regions and failures use alert regions.

## State and Request Lifecycle

The browser separates draft text from the committed filter snapshot used for requests:

- `queryDraft` and `authorDraft` update on each keystroke;
- after 300 milliseconds, their normalized values enter the committed snapshot;
- key and tag changes update the committed snapshot immediately;
- the committed snapshot is the single source of truth for repository calls, pagination, refresh, retry, and empty-state wording.

Each committed-filter change starts a replacement request and advances the existing request generation. It resets the cursor, append state, and append error. Only the latest generation may replace results or report an error.

An older success or failure from a previous filter snapshot is ignored. Append requests are applied only when their base generation remains current. The existing synchronous append guard continues to prevent duplicate `Load more` calls.

Owned-pack deletion and loading into the editor remain unchanged. Deleted IDs remain suppressed from replacement and append responses, including stale or overlapping filtered responses. Filter changes do not affect repository ownership state.

## Error Handling

A failed filtered replacement keeps the committed filters and existing cards visible when cards already exist. It presents a safe error and a retry action that repeats the same filter snapshot. If no prior cards exist, the existing replacement-error presentation is used.

Append failure preserves the current filtered cards, cursor, and filters. Retry uses the same filters and cursor.

Repository validation, configuration, transport, and malformed-response failures continue through the existing typed sharing error boundary. Search text must never appear in raw SQL errors, and credentials or ownership tokens must never enter search arguments or UI diagnostics.

## Database and Indexing

The first implementation uses bounded `ILIKE` and case-folded tag checks inside the security-definer RPC. This is sufficient for the current Supabase Free-scale dataset and avoids introducing an extension solely for speculative scale.

The existing public-order partial index remains useful for unfiltered listing and ordered scans. Trigram or expression indexes are deferred until observed query plans or data volume justify them. The new RPC retains an empty `search_path`, schema-qualifies referenced objects and functions, and receives only `anon` and `authenticated` execute grants.

## Testing

### Database tests

- combined query matches pack name, author name, and tags;
- combined query does not search track sound or chord display names;
- author matching is case-insensitive and partial;
- Pack Key is exact and limited to twelve values;
- tag matching is case-insensitive, exact, and AND-based;
- different condition types combine with AND semantics;
- `%`, `_`, and the escape character match literally;
- empty optional conditions behave as inactive conditions;
- invalid lengths, duplicate tags, excessive tags, invalid keys, limits, and cursors are rejected;
- filtered results retain newest-first cursor pagination without duplicates or omissions;
- hidden and deleted records remain absent;
- function security configuration and grants match the existing RPC policy.

### Repository tests

- normalized filters map to the exact RPC arguments;
- cursors are forwarded unchanged;
- valid pages use the shared strict response parser;
- RPC rejection and malformed response errors use the existing safe error types;
- unfiltered `listPacks` behavior remains unchanged.

### Component tests

- initial no-filter load still uses `listPacks`;
- combined and author text inputs debounce for 300 milliseconds;
- IME composition does not commit partial text;
- Key and tag changes invoke filtered search immediately;
- duplicate and blank tags are not added;
- removing a chip updates the AND filter immediately;
- `Clear filters` restores the unfiltered newest list;
- condition changes reset pagination and ignore stale successes and failures;
- refresh and append preserve the committed filter snapshot;
- filtered empty, replacement error, append error, and retry states are correct;
- existing cards remain visible during a filtered replacement;
- deletion suppression, ownership actions, and Editor loading keep working;
- responsive and accessible filter CSS and labels are present.

### Release verification

- all frontend Vitest suites pass;
- Supabase database reset and pgTAP suites pass;
- deployment and static-server tests pass;
- the TypeScript and Vite production build succeeds;
- a manual browser check covers text debounce, Japanese IME input, tag chips, Key selection, filtered pagination, refresh, and narrow-screen layout.

## Acceptance Criteria

The feature is accepted when a user can automatically search all visible shared packs by pack name, author, or tag; narrow the results with an author substring, one chromatic Pack Key, and multiple required tags; paginate and refresh that filtered result set; clear all filters; and continue loading or deleting packs without stale requests, hidden records, or unrelated Editor and MIDI state being affected.
