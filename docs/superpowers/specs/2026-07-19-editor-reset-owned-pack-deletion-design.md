# Editor Reset and Owned Pack Deletion Design

## Goal

Add two destructive, confirmation-protected user workflows to the existing application:

- reset the local editor to its default chord pack without disconnecting SEQTRAK; and
- delete a shared pack only when the current browser retains its ownership token.

The workflows share confirmation, focus, and safe-error conventions, but remain independent state machines. Reset is local and synchronous. Delete crosses the repository and Supabase boundary and must distinguish server failure from deletion that succeeded before local ownership cleanup failed.

## Scope

This release includes:

- an Editor `Reset` action and dedicated confirmation dialog;
- ownership-aware Delete actions in the existing Shared Packs list;
- a dedicated shared-pack deletion confirmation dialog;
- immediate local removal of a successfully deleted card;
- safe retry, partial-success, stale-request, and focus behavior;
- responsive styling and automated tests.

This release does not include shared-pack update, reporting UI, an owned-packs view, bulk deletion, undo, restoration of deleted packs, or a new Supabase migration. The existing `delete_pack` RPC and soft-delete behavior already meet the backend requirement.

## Existing Foundation

`createDefaultPack()` defines the Editor default. The editor reducer already supports validated whole-pack replacement and resets selection to slot 1 through `replacePack`.

The sharing backend already provides:

- `delete_pack(pack_id, ownership_token)` with owner verification and soft deletion;
- a `PackRepository.deletePack(packId)` operation;
- browser ownership-token storage;
- removal of the ownership record only after a successful delete RPC;
- omission of deleted packs from public list and get results.

The missing pieces are ownership capability exposure at the repository boundary, UI workflows, local partial-success modeling, and cross-component state coordination.

## Architecture and Responsibilities

### Repository ownership capability

Add a synchronous repository capability:

```ts
ownsPack(packId: string): boolean;
```

`SupabasePackRepository` implements it by checking whether its `PackOwnershipStore` contains a token for the ID. It never returns or exposes the token. Test repositories implement the same interface explicitly.

If browser storage cannot be read, `ownsPack` returns `false` and the Delete action is not exposed. A storage read failure encountered by an already-open delete workflow is normalized to the same safe non-retriable ownership error as a missing token.

The Shared Packs UI depends only on `PackRepository`; it must not import the localStorage ownership store or Supabase implementation.

### Reset workflow

`App` owns Reset availability, confirmation state, and completion because it already owns the editor, SCALE, MIDI, publication, and SEQTRAK KEY states.

A dedicated `ResetEditorDialog` receives callbacks and a trigger ref. Confirming dispatches a replacement with a fresh `createDefaultPack()`, resets the selected slot to 1 through the reducer, and sets `currentScale` to `null`.

Reset preserves:

- the live MIDI client and connection status;
- input and output port selections;
- target track;
- the current transient SEQTRAK KEY offset;
- the last successful publication fingerprint.

Reset does not make a device request or write to SEQTRAK.

### Delete workflow

`SharedPackBrowser` owns the selected deletion target, deletion state, per-list notifications, deleted-ID suppression, and removal of the card. It renders Delete only when `getRepository().ownsPack(pack.id)` is true.

A dedicated `DeleteSharedPackDialog` receives a fixed `PublicPack` target. Retry always uses that target's ID even if other list state changes.

After successful or partial-success deletion, `SharedPackBrowser` removes the card and calls an App callback with the deleted pack. App compares the deleted pack's editable fingerprint with `lastPublishedFingerprint`. It clears the fingerprint only on equality, allowing the deleted version to be published again without weakening duplicate prevention for unrelated deletions.

Delete does not change Editor contents, selection, SCALE, MIDI connection, ports, target track, or live KEY.

## Editor Reset Behavior

### Availability

Reset is enabled when at least one resettable value differs from the reset target:

- the current pack differs structurally from a fresh default pack;
- the selected slot is not slot 1; or
- SCALE is not `null`.

It is disabled when all three are already at their reset values. It is also disabled while publication is submitting so it cannot conflict with the fixed publication snapshot.

The equality check covers all pack data used by the Editor. It does not use object identity.

### Confirmation

The Editor header places `Reset` beside the publication controls. Activating it opens a modal with:

- heading: `Reset editor?`
- description: `This replaces the current pack with the default pack and clears SCALE. Your MIDI connection and SEQTRAK KEY will be preserved.`
- actions: `Cancel` and `Reset editor`

Cancel, Escape, or backdrop activation closes the dialog without changing state. Confirmation resets the Editor and shows:

`Editor reset to the default pack.`

Because Reset is synchronous, it has no progress or retry state.

### Publication interaction

Reset does not clear `lastPublishedFingerprint`. If the default pack is the last successfully published content, Publish remains disabled after Reset. If a different pack was last published, Reset uses the normal content fingerprint comparison.

Confirmed Reset clears any visible publication success or warning notice and replaces it with the Reset completion status. The underlying `lastPublishedFingerprint` remains intact.

## Owned Pack Deletion Behavior

### Delete visibility

Each shared card evaluates ownership through `ownsPack(pack.id)`. Only an owned card renders a Delete action. A missing, corrupt, or cleared local ownership record means the action is absent. Ownership is a browser capability, not a public property of `PublicPack`.

### Confirmation

Activating Delete opens a modal with:

- heading: `Delete shared pack?`
- the fixed pack name and author;
- a statement that deletion cannot be undone;
- actions: `Cancel` and `Delete pack`.

Opening moves focus to the dialog heading. Closing restores focus to the connected Delete trigger. Cancel, Escape, and backdrop activation close the dialog before submission.

While submitting:

- both buttons are disabled;
- Escape and backdrop close are suppressed;
- `Deleting…` is exposed through `role="status"`;
- a synchronous in-flight ref prevents duplicate repository calls.

### Successful deletion

After repository success:

- remove the target card immediately without changing scroll position;
- add the pack ID to the browser session's deleted-ID set;
- show `Deleted “<pack name>” from Shared Packs.` through `role="status"`;
- notify App with the deleted pack;
- close the dialog and restore focus only if the trigger remains connected.

If the list becomes empty, show `No shared packs yet.` The next Refresh remains the authoritative server resynchronization.

### Deleted-ID suppression

Every replace and append response is filtered against the session's deleted-ID set before entering list state. This prevents a list request that began before deletion from restoring a successfully deleted card. The set lasts for the mounted Shared Packs browser session and is cleared by a full unmount/remount; the server then remains authoritative.

### Publication interaction

App converts the deleted `PublicPack` to its editable representation and fingerprints it with the same deterministic function used for publication. When it equals `lastPublishedFingerprint`, App clears that fingerprint and Publish becomes available. Deleting a different pack does not change publication eligibility.

## Error and Partial-Success Handling

### Server or transport failure

A failure before confirmed server deletion leaves the card and fixed dialog target intact. Retriable failures stop the busy state and retain `Delete pack` as a retry action.

Deletion UI maps known repository error classes to fixed safe messages. Unknown values map to a generic fixed message. It never renders raw backend messages, SQL text, anon keys, ownership tokens or hashes, constraint names, or privileged metadata.

### Ownership no longer available

If ownership disappears between rendering the action and confirming deletion, show:

`This browser can no longer delete this pack.`

This state is non-retriable. The dialog offers only a close action, and the card's Delete action disappears when ownership is reevaluated.

### Local ownership removal failure

If the delete RPC succeeds but removing browser ownership fails, the repository throws a dedicated `PackOwnershipRemovalError` only after server success. The error contains a safe pack ID and a fixed generic cause; it does not retain the token or storage exception.

The UI treats this as partial success:

- remove the card and suppress its ID exactly as for normal success;
- notify App exactly as for normal success;
- do not retry deletion;
- show the warning:

`Deleted “<pack name>”, but local ownership information could not be removed. The pack is no longer shared.`

### Lifecycle and races

Deletion receives a monotonically increasing generation. Success and failure update state only if the component remains mounted and the generation is current. List replace and append generations retain their existing stale-response protection, while deleted-ID filtering handles overlap with a successful delete.

## Accessibility and Responsive Presentation

Both dialogs use native `<dialog>` behavior with the established `showModal()` fallback. They provide accessible label and description relationships, focus the heading on open, and restore the connected trigger on close. Errors use `role="alert"`; progress and success or warning notifications use `role="status"`.

Danger actions are visually distinct without relying on color alone. Focus outlines remain visible. Dialog cards are viewport-bounded and internally scrollable. At narrow widths, Reset and publication controls wrap, dialog actions become touch-friendly, and card actions remain usable without horizontal overflow.

## Testing Strategy

Implementation follows test-driven development.

### Domain and App tests

- Reset availability reflects pack, slot, and SCALE reset targets.
- Confirmed Reset restores a fresh default pack, slot 1, and unknown SCALE.
- Cancel, Escape, and backdrop leave all state unchanged.
- Reset preserves MIDI connection, ports, target track, and live KEY.
- Reset is unavailable during publication and preserves publication fingerprint semantics.
- Reset confirmation focus and completion status are correct.
- Deleting a pack equal to the last published fingerprint re-enables Publish; deleting another pack does not.

### Dialog and browser tests

- Only owned cards render Delete.
- Confirmation displays the fixed name and author.
- Cancel, Escape, backdrop, focus, and submitting suppression work.
- Same-render double activation makes one repository call.
- Success removes the card and exposes a status message.
- Retriable failure retains the card and fixed target for retry.
- Ownership loss becomes non-retriable and hides the action.
- Partial success removes the card, warns, and never retries.
- Old replace or append responses cannot restore a deleted ID.
- Completion after unmount does not update state.
- Empty-list behavior works after deletion.
- Raw backend or secret-bearing error text never appears.

### Repository tests

- `ownsPack` reports token presence without exposing the token.
- Missing ownership fails before the delete RPC.
- Failed RPC retains ownership.
- Successful RPC removes ownership.
- Storage removal failure after RPC success throws `PackOwnershipRemovalError` with safe fixed diagnostics.

### Regression and release verification

- Existing pack browsing, loading, publication, MIDI, KEY, SCALE, recommendation, and keyboard tests remain green.
- Frontend tests, deployment tests, static-server tests, production build, and diff checks pass.
- Responsive layout receives a browser visual check at desktop, 820px, and 460px when available; automated CSS contract tests remain the required gate.

## Success Criteria

- Reset safely returns only the approved Editor state to defaults.
- Users can discover and delete only packs owned by the current browser.
- Successful deletion updates the list immediately and cannot be undone.
- Server-success/local-cleanup-failure is represented as non-retriable partial success.
- Deletion never exposes ownership data or backend diagnostics.
- Delete and Reset do not disturb the live SEQTRAK connection or unrelated Editor state.
- Deleting the last-published identical version restores valid publication eligibility.
