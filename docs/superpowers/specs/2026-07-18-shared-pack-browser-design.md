# Shared Pack Browser Design

## Goal

Add the first read-only chord-pack sharing UI to the existing SEQTRAK Chord Manager. Users can browse the newest shared packs and load one into the local editor without changing the shared record.

This slice proves the frontend/backend boundary already established by `PackRepository` while keeping the editor and Web MIDI workflow usable when sharing is unavailable.

## Scope

Included:

- An `Editor` / `Shared Packs` view switch in the application header.
- A newest-first shared-pack list with 20 items per page.
- Cursor-based `Load more` pagination.
- Manual refresh from the first page.
- Loading, empty, configuration-error, request-error, and retry states.
- Loading a shared pack into the editor after confirmation.
- Responsive and keyboard-accessible controls.

Excluded:

- Publishing a pack.
- Updating or deleting a shared pack.
- Reporting a pack.
- Search, tag filters, sorting choices, and popularity ranking.
- Maintaining an ownership or update relationship after loading a shared pack.

## Application Structure

`App` owns the active top-level view: `editor` or `shared-packs`. The existing editor and MIDI state remain in `App` so switching views does not discard them.

A new `SharedPackBrowser` component owns list-specific presentation and asynchronous state:

- current items;
- next cursor;
- initial/refresh loading state;
- append loading state;
- initial/refresh error;
- append error;
- request generation used to reject stale completions.

The component depends on a `PackRepository` rather than importing Supabase directly. `App` accepts an optional repository dependency for deterministic tests. In production, the application lazily creates the Supabase repository from Vite environment variables when the user first opens `Shared Packs`. A missing or invalid sharing configuration is contained within the shared view and does not disable the editor or MIDI controls.

## Navigation and Layout

The header contains two switch controls:

- `Editor`
- `Shared Packs`

The active control is visually distinct and exposes its selected state to assistive technology. Only the active view is rendered in the main content area. Returning to the editor preserves its current pack, selected slot, MIDI connection state, selected ports, track, SCALE, and current SEQTRAK KEY offset.

The shared view contains:

- a `Shared Packs` heading;
- a short description;
- a `Refresh` action;
- a responsive card grid;
- a conditional `Load more` action.

Cards use one column on narrow screens and multiple columns when space allows.

## Pack Card Content

Each card displays:

- pack name;
- author name;
- musical key;
- track sound name;
- tags;
- all seven chord display names;
- creation date;
- `Load into editor` action.

The creation timestamp is formatted for the user's locale. Machine-readable date information remains available through semantic markup.

## Fetching and Pagination

Opening `Shared Packs` for the first time calls:

```ts
repository.listPacks({ limit: 20 })
```

The response replaces the current list and stores `nextCursor`.

When `nextCursor` is non-null, `Load more` calls:

```ts
repository.listPacks({ limit: 20, cursor: nextCursor })
```

Successful results append to the existing cards and replace the cursor. The action is hidden when no next cursor remains.

`Refresh` always requests the first page and replaces both items and cursor. It never appends.

Every replace-style request receives a monotonically increasing generation number. Only the latest generation may replace list state. This prevents an older initial request or refresh from overwriting a newer result. Append requests are disabled while another list request is active and only apply if their base generation is still current.

## Loading into the Editor

`Load into editor` always opens a confirmation dialog explaining that the current editor contents will be replaced. Cancellation has no effect.

After confirmation, the selected `PublicPack` is converted to a new `ChordPack`. The conversion copies only editable musical data:

- `packName`
- `authorName`
- `tags`
- `key`
- `trackSoundName`
- optional `sourceTrackIndex`
- cloned chord slots and note arrays

It does not retain the public pack ID, timestamps, report count, or any future ownership/update association. Local-only flags use their normal visible, active defaults: `reportedCount: 0`, `hidden: false`, and `deleted: false`.

`App` dispatches the existing `replacePack` action. Existing pack validation remains the final guard, the selected chord slot resets to slot 1, and the status message becomes:

```text
Loaded “<pack name>” from shared packs.
```

The application then switches to `Editor`. Loading a shared pack does not change the live SEQTRAK KEY offset. It invalidates any prior device-read SCALE before a device write, because the newly loaded pack has not been read from the currently selected SEQTRAK track.

## Loading, Empty, and Error States

- Initial request: show `Loading shared packs…` in the list region.
- Empty success: show a clear empty-state message.
- Initial or refresh failure: show a safe error message and `Try again` action.
- Append request: keep existing cards visible, disable the pagination action, and show progress in the action label.
- Append failure: keep existing cards and cursor, show an inline error near `Load more`, and allow retry.
- Missing Supabase environment variables: show a sharing configuration error only within the shared view.

Errors must not expose credentials or raw secret values. Existing repository error mapping remains the source of user-safe service errors.

## Accessibility

- The view switch uses buttons with an explicit selected/current state.
- Loading and error changes are announced through status or alert regions as appropriate.
- All actions are reachable and operable with a keyboard.
- Disabled controls expose their native disabled state.
- Cards use headings and semantic time elements rather than relying only on visual styling.
- Focus remains on the triggering navigation control when switching views; after a confirmed load, focus follows normal document order in the editor.

## Testing Strategy

Implementation follows test-driven development. Component and integration tests cover:

- first opening requests the newest 20 packs;
- loading, empty, error, and retry states;
- pack metadata and seven chord names render correctly;
- `Load more` passes the returned cursor and appends results;
- append failure preserves current items and remains retryable;
- refresh requests the first page and replaces the list;
- stale replace-style request completions are ignored;
- cancelling confirmation preserves the editor;
- confirming loads a deep-cloned independent pack, resets selection to slot 1, clears write eligibility, shows the load message, and returns to the editor;
- missing sharing configuration leaves the editor operational;
- existing editor, audio preview, MIDI connection, KEY update, read, and write tests continue to pass.

Verification includes unit/integration tests, TypeScript compilation, and the production Vite build.

## Extension Points

`SharedPackBrowser` receives callbacks and a repository interface rather than owning publishing or editor state. Future slices can add a detail view, publish action, owner actions, report action, filters, or alternate sorting without coupling Supabase calls to the editor components.
