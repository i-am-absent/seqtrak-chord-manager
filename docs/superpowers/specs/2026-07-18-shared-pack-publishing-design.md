# Shared Pack Publishing Design

## Goal

Allow a user to publish the chord pack currently open in the Editor as an anonymous shared-pack snapshot. Publishing must be deliberate, retryable, resistant to accidental duplicates, and isolated from the Editor's MIDI and device state.

## Scope

Included:

- A `Publish` action in the Editor header.
- An in-application confirmation dialog showing the exact snapshot to publish.
- Creation through the existing `PackRepository.createPack()` boundary.
- Repository-owned persistence of the browser ownership token.
- Success and retryable error states.
- In-memory prevention of repeated publication of the same successful snapshot.
- A success action that opens the refreshed `Shared Packs` view.
- Accessible dialog focus and keyboard behavior.

Excluded:

- Associating the current Editor pack with the created public record.
- Updating or deleting a published pack.
- Reporting, search, filtering, sorting choices, and popularity ranking.
- Persisting duplicate-publication state across a page reload.
- Creating automated test data in the production Supabase project.

## Snapshot Boundary

Publishing captures the current pack as a new immutable-in-flight snapshot. A pure conversion function maps `ChordPack` to `EditablePack` by copying only:

- `packName`
- `authorName`
- `tags`
- `key`
- `trackSoundName`
- optional `sourceTrackIndex`
- cloned chord slots and note arrays

The payload excludes the public ID, timestamps, report count, hidden/deleted state, SEQTRAK KEY offset, SCALE, selected slot, MIDI state, and any ownership value. The fixed snapshot, rather than live Editor state, is displayed and submitted. Changes to the Editor cannot alter a pending publication.

Before opening the dialog, a sharing-specific validator checks the snapshot against the existing backend contract. Pack name, author, track sound, every tag, and every chord display name must be non-empty and have no leading or trailing ASCII space. Maximum lengths are 100 code points for pack name, track sound, and chord display name; 50 for author; and 30 per tag. A pack may contain at most ten exactly unique tags. The key must be one of the twelve chromatic names, an optional source track must be an integer from 0 through 9, slots 1 through 7 must appear exactly once, and every relative note array must pass the existing chord validation. The backend remains the final authority, but known-invalid metadata is rejected before confirmation and network access.

The existing repository remains responsible for generating the 256-bit ownership token, submitting it once, validating the public response, and storing the `{ packId, token }` ownership entry only after success. The returned `PublicPack` is not loaded into the Editor, and its ID is not attached to the local pack. Publishing is a snapshot operation, not the beginning of a live association.

## Application Structure

`App` continues to own top-level Editor and device state. It reuses the same lazy, injectable `getPackRepository()` provider used by `SharedPackBrowser`.

Publication-specific responsibilities are split as follows:

- A pure sharing mapper creates an `EditablePack` and a deterministic publication fingerprint.
- `App` owns the captured snapshot, submission state, last successful fingerprint, publication message, and view transition.
- A controlled `PublishPackDialog` renders the snapshot, accessibility behavior, actions, progress, and error text. It does not import Supabase or call repository methods directly.

Keeping async publication state in `App` ensures the last successful fingerprint survives Editor/Shared Packs view switching. A page reload resets it by design.

## Publication Fingerprint

The fingerprint is a deterministic serialization of the exact `EditablePack` snapshot, preserving semantically meaningful order for tags, chord slots, and notes. It includes the optional source track only when present.

After a successful publication, `App` stores that snapshot's fingerprint. `Publish` is disabled whenever the current Editor snapshot has the same fingerprint, and the UI displays:

```text
This version is already shared.
```

Any content change that produces a different fingerprint re-enables publishing. If the user later restores the exact successful content, publishing becomes disabled again. Failed or cancelled attempts never update the successful fingerprint.

This is an accidental-duplicate guard for the current browser session, not a global uniqueness rule. Reloading the page intentionally clears the guard.

## Confirmation Dialog

Selecting `Publish` first validates the current local pack. If validation fails, the dialog does not open and the Editor displays the first validation error.

On success, `App` captures an `EditablePack` snapshot and opens the dialog. It displays:

- pack name;
- author name;
- musical key;
- track sound name;
- tags;
- all seven chord display names;
- a notice that publication creates an independent snapshot and does not link it to the current Editor.

The actions are:

- `Cancel`
- `Publish shared pack`

Before submission, Cancel, Escape, and backdrop activation close the dialog without changing Editor or publication state. While submitting, both actions are disabled, the primary label becomes `Publishing…`, and Escape/backdrop closing is suppressed. A synchronous in-flight guard prevents same-render double submission in addition to the disabled state.

## Accessibility and Focus

The dialog uses native `<dialog>` behavior where supported by the application's browser baseline, with an accessible name and description. Opening the dialog moves focus to its heading or first meaningful control. Closing returns focus to the `Publish` trigger.

The modal makes background content unavailable for interaction while open. Escape and backdrop behavior are explicit and testable. Submission progress is announced with a status region; errors use an alert region. No focus restoration occurs after App unmount.

## Submission Flow

After confirmation:

1. Mark the captured snapshot as in flight and clear its prior error.
2. Lazily obtain the shared `PackRepository`.
3. Call `repository.createPack(snapshot)` exactly once.
4. Ignore stale completion if the App has unmounted or the active publication generation has been invalidated.
5. On a valid success, store the snapshot fingerprint, close the dialog, keep the Editor active, and display:

```text
Published “<pack name>” to Shared Packs.
```

6. Display `View Shared Packs` beside the success message.

The publication handler does not alter the pack, selected slot, current SCALE, selected ports, target track, MIDI connection, or live SEQTRAK KEY offset.

Selecting `View Shared Packs` switches views. Because the browser view mounts anew, it requests the first newest page and shows the created pack at the appropriate server-defined position. No optimistic list insertion is required.

## Error and Retry Behavior

Synchronous repository configuration errors, transport failures, server validation errors, and invalid public responses are presented within the open dialog through the repository's safe error messages.

On failure:

- keep the fixed snapshot and dialog open;
- restore the primary action to `Publish shared pack`;
- allow retry using the same snapshot;
- allow Cancel, Escape, and backdrop closing again;
- do not set the successful fingerprint;
- do not change the Editor or device state.

Error rendering must not expose ownership tokens, the anon key, SQL text, ownership hashes, or privileged server metadata. The existing repository scrubbing and typed error boundary remains authoritative.

### Ownership Persistence Partial Success

Supabase can successfully create the public record before localStorage rejects the ownership-token save. Retrying that operation would create a duplicate pack, so this condition is not treated as a retryable publication failure.

The repository introduces a typed ownership-persistence error that carries only the already validated created `PublicPack`; it never exposes the ownership token. When `App` receives this error, it:

- treats the snapshot as published;
- stores the successful snapshot fingerprint and blocks identical republishing;
- closes the dialog and stays in the Editor;
- displays `View Shared Packs`;
- displays this warning:

```text
Published “<pack name>”, but ownership could not be saved. This browser cannot update or delete it later.
```

The warning must not offer a retry action. The created pack remains public, while this browser intentionally has no owner-management capability for it. Other local ownership entries remain unchanged.

## Concurrency and Lifecycle

Only one publication request may be active. A ref-backed in-flight guard blocks rapid repeated activation before React state is committed.

Each submission has a generation identifier. App unmount invalidates the generation. A stale success or failure must not close a newer dialog, set a fingerprint, show a message, or update React state. Submission completion does not cancel or dispose the MIDI client.

The captured snapshot remains unchanged across retries. Closing a failed attempt and opening a new confirmation captures the Editor's then-current contents as a new snapshot.

## Testing Strategy

Implementation follows test-driven development. Tests cover:

- mapping `ChordPack` to an exact, deeply cloned `EditablePack`;
- deterministic fingerprints, including changed and restored content;
- complete confirmation summary for the captured snapshot;
- validation failure without opening the dialog;
- Cancel, Escape, and backdrop closing without repository calls;
- suppression of those closing paths during submission;
- synchronous duplicate-submit guarding;
- exact one-call `createPack(snapshot)` behavior;
- successful ownership/repository flow through an injected fake;
- sharing-specific validation of text normalization, code-point limits, tags, track index, slots, and notes before confirmation;
- success message and `View Shared Packs` navigation;
- preservation of pack, selected slot, SCALE, ports, track, MIDI connection, and live KEY;
- disabling the same successful snapshot, re-enabling after edits, and disabling after exact restoration;
- safe configuration, transport, validation, and response errors;
- retry with the same fixed snapshot;
- ownership-save partial success without retry, duplicate creation, or token exposure;
- stale completion after unmount;
- dialog labelling, status/alert regions, focus movement, modal background blocking, and focus restoration;
- all existing shared browsing/loading, Editor, audio, MIDI, deployment, server, and production-build checks.

Production verification may read the deployed list but must not automatically create a public record. A real publication remains an explicit user action.

## Extension Points

The repository continues to persist ownership independently of Editor association. A later `My Shared Packs` slice can enumerate locally owned pack IDs, retrieve their public records, and add owner update/delete actions without changing the snapshot-publication contract.
