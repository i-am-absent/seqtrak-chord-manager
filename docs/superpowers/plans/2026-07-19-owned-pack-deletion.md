# Owned Pack Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the current browser delete only shared packs it owns, with safe confirmation, immediate list removal, partial-success handling, and publication eligibility restoration.

**Architecture:** `PackRepository` exposes only a boolean ownership capability and contains storage failures. `SharedPackBrowser` owns the deletion state machine and deleted-ID suppression; a focused dialog owns modal behavior. App receives the deleted snapshot solely to reconcile its last-published fingerprint.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Supabase RPC repository, Vite, CSS

## Global Constraints

- Delete is rendered only when `ownsPack(packId)` returns `true`.
- Ownership tokens and localStorage are never exposed to UI components.
- Delete confirmation uses the fixed target pack ID, name, and author.
- Successful deletion removes the card in place and is not undoable.
- Server-success/local-ownership-removal-failure is non-retriable partial success.
- Raw backend messages, SQL, anon keys, ownership tokens or hashes, constraint names, and privileged metadata never reach Delete UI.
- Delete preserves Editor contents, selection, SCALE, MIDI connection, ports, target track, and live KEY.
- No Supabase migration and no new runtime dependency are allowed.
- Implementation must use test-driven development and preserve list pagination and stale-response behavior.

---

## File Structure

- Modify `src/sharing/packRepository.ts`: add the boolean ownership capability.
- Modify `src/sharing/errors.ts`: model deletion partial success.
- Modify `src/sharing/supabasePackRepository.ts`: defensive ownership checks and removal-error boundary.
- Modify `src/sharing/supabasePackRepository.test.ts`: repository lifecycle and secret containment.
- Modify repository mocks in `src/App.test.tsx` and `src/components/SharedPackBrowser.test.tsx`.
- Create `src/components/DeleteSharedPackDialog.tsx`: fixed-target native modal.
- Create `src/components/DeleteSharedPackDialog.test.tsx`: dialog behavior.
- Modify `src/components/SharedPackBrowser.tsx`: Delete visibility, state machine, stale suppression, and notices.
- Modify `src/components/SharedPackBrowser.test.tsx`: ownership, deletion, races, retry, and partial-success tests.
- Modify `src/App.tsx` and `src/App.test.tsx`: deleted-pack fingerprint reconciliation.
- Modify `src/styles.css`: card danger action, dialog, notice, and responsive layout.

### Task 1: Repository Ownership and Delete Partial Success

**Files:**
- Modify: `src/sharing/packRepository.ts`
- Modify: `src/sharing/errors.ts`
- Modify: `src/sharing/supabasePackRepository.ts`
- Modify: `src/sharing/supabasePackRepository.test.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/components/SharedPackBrowser.test.tsx`

**Interfaces:**
- Produces: `PackRepository.ownsPack(packId: string): boolean`.
- Produces: `PackOwnershipRemovalError` with `readonly packId: string`, fixed message, and fixed safe cause.
- Preserves: `deletePack(packId: string): Promise<void>`.

- [ ] **Step 1: Add failing repository ownership tests**

In `src/sharing/supabasePackRepository.test.ts`, add:

```ts
it("reports ownership presence without exposing its token and contains storage reads", () => {
  const { ownership, repository } = setup();
  ownership.save(publicPack.id, TOKEN);
  expect(repository.ownsPack(publicPack.id)).toBe(true);
  expect(repository.ownsPack("00000000-0000-4000-8000-000000000099")).toBe(false);
  vi.spyOn(ownership, "get").mockImplementation(() => { throw new Error(`storage ${TOKEN}`); });
  expect(repository.ownsPack(publicPack.id)).toBe(false);
});
```

Run `npm test -- src/sharing/supabasePackRepository.test.ts`.

Expected: FAIL because `ownsPack` does not exist.

- [ ] **Step 2: Add the failing removal partial-success test**

Import `PackOwnershipRemovalError` and add:

```ts
it("reports ownership removal failure as token-free delete partial success", async () => {
  const { client, ownership, repository } = setup();
  ownership.save(publicPack.id, TOKEN);
  const storageFailure = new Error(`localStorage rejected ${TOKEN}`);
  vi.spyOn(ownership, "remove").mockImplementation(() => { throw storageFailure; });
  client.responses.push({ data: null, error: null });

  const error = await repository.deletePack(publicPack.id).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(PackOwnershipRemovalError);
  expect(error).not.toBe(storageFailure);
  expect(error).toMatchObject({
    packId: publicPack.id,
    message: "The pack was deleted, but browser ownership could not be removed."
  });
  expect((error as Error & { cause?: Error }).cause?.message)
    .toBe("Browser storage rejected ownership removal.");
  expect(JSON.stringify(error)).not.toContain(TOKEN);
  expect(client.calls).toHaveLength(1);
});
```

Run the focused test.

Expected: FAIL because the storage error currently escapes directly.

- [ ] **Step 3: Implement the repository contract and safe error**

Add to `PackRepository`:

```ts
ownsPack(packId: string): boolean;
```

Add to `src/sharing/errors.ts`:

```ts
export class PackOwnershipRemovalError extends Error {
  readonly packId: string;
  constructor(packId: string) {
    super("The pack was deleted, but browser ownership could not be removed.");
    this.name = "PackOwnershipRemovalError";
    this.packId = packId;
    Object.defineProperty(this, "cause", {
      value: new Error("Browser storage rejected ownership removal.")
    });
  }
}
```

In `SupabasePackRepository`, add:

```ts
ownsPack(packId: string): boolean {
  try { return this.ownership.get(packId) !== null; }
  catch { return false; }
}
```

Replace ownership removal in `deletePack` with:

```ts
try { this.ownership.remove(packId); }
catch { throw new PackOwnershipRemovalError(packId); }
```

Normalize storage read errors in `requireOwnership`:

```ts
private requireOwnership(packId: string): string {
  let token: string | null;
  try { token = this.ownership.get(packId); }
  catch { throw new PackOwnershipError("This browser does not own the shared pack."); }
  if (!token) throw new PackOwnershipError("This browser does not own the shared pack.");
  return token;
}
```

- [ ] **Step 4: Update all repository test doubles**

In every object literal typed as `PackRepository`, add an explicit safe default:

```ts
ownsPack: vi.fn().mockReturnValue(false),
```

Find all required locations with:

```bash
rg -n "PackRepository|createPack: vi.fn" src --glob "*.test.ts*"
```

Do not add a default method to production interfaces or make `ownsPack` optional.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
npm test -- src/sharing/supabasePackRepository.test.ts src/App.test.tsx src/components/SharedPackBrowser.test.tsx
npm test -- --maxWorkers=1
```

Expected: focused and full frontend tests PASS.

- [ ] **Step 6: Commit repository support**

```bash
git add src/sharing/packRepository.ts src/sharing/errors.ts src/sharing/supabasePackRepository.ts src/sharing/supabasePackRepository.test.ts src/App.test.tsx src/components/SharedPackBrowser.test.tsx
git commit -m "feat: expose safe shared pack ownership"
```

### Task 2: Delete Confirmation Dialog

**Files:**
- Create: `src/components/DeleteSharedPackDialog.tsx`
- Create: `src/components/DeleteSharedPackDialog.test.tsx`

**Interfaces:**
- Consumes: `PublicPack`, `RefObject<HTMLButtonElement | null>`.
- Produces: `DeleteSharedPackDialog` with `target`, `submitting`, `error`, `retryable`, `trigger`, `onCancel`, and `onConfirm` props.

- [ ] **Step 1: Write failing modal and fixed-target tests**

Create `src/components/DeleteSharedPackDialog.test.tsx` with these imports, `showModal` stub, fixture, and first assertion:

```tsx
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { toEditablePack } from "../sharing/editablePack";
import type { PublicPack } from "../sharing/types";
import { DeleteSharedPackDialog } from "./DeleteSharedPackDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() { this.setAttribute("open", ""); }
  });
});

const local = createDefaultPack();
const target: PublicPack = {
  ...toEditablePack(local),
  id: "00000000-0000-4000-8000-000000000001",
  packName: "Owned Pack",
  authorName: "Ada",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  reportedCount: 0
};
const trigger = createRef<HTMLButtonElement>();
const onCancel = vi.fn();
const onConfirm = vi.fn();
render(<DeleteSharedPackDialog
  target={target}
  submitting={false}
  error=""
  retryable
  trigger={trigger}
  onCancel={onCancel}
  onConfirm={onConfirm}
/>);
expect(screen.getByRole("dialog", { name: "Delete shared pack?" })).toHaveAttribute("open");
expect(screen.getByRole("heading", { name: "Delete shared pack?" })).toHaveFocus();
expect(screen.getByText("Owned Pack")).toBeInTheDocument();
expect(screen.getByText("Ada")).toBeInTheDocument();
expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
```

Add a cancellation test that mounts a fresh dialog before each close route and executes:

```tsx
await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
fireEvent(dialog, new Event("cancel", { cancelable: true }));
fireEvent.click(dialog);
expect(onCancel).toHaveBeenCalledTimes(1);
```

and submitting behavior:

```tsx
expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
expect(screen.getByRole("status")).toHaveTextContent("Deleting…");
```

Add the non-retriable and focus assertions exactly:

```tsx
expect(screen.getByRole("alert")).toHaveTextContent("This browser can no longer delete this pack.");
expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
expect(screen.queryByRole("button", { name: "Delete pack" })).not.toBeInTheDocument();
view.rerender(<button ref={trigger}>Delete trigger</button>);
expect(trigger.current).toHaveFocus();
```

- [ ] **Step 2: Run the test and verify RED**

Run `npm test -- src/components/DeleteSharedPackDialog.test.tsx`.

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the complete focused component**

Create `src/components/DeleteSharedPackDialog.tsx` with the complete implementation:

```tsx
import { useEffect, useRef, type RefObject } from "react";
import type { PublicPack } from "../sharing/types";

export interface DeleteSharedPackDialogProps {
  target: PublicPack;
  submitting: boolean;
  error: string;
  retryable: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSharedPackDialog({
  target, submitting, error, retryable, trigger, onCancel, onConfirm
}: DeleteSharedPackDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    headingRef.current?.focus();
    return () => { if (trigger.current?.isConnected) trigger.current.focus(); };
  }, [trigger]);

  return (
    <dialog
      className="delete-dialog"
      ref={dialogRef}
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
      onClick={(event) => {
        if (!submitting && event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="delete-dialog-card">
        <h2 id="delete-dialog-title" ref={headingRef} tabIndex={-1}>Delete shared pack?</h2>
        <p id="delete-dialog-description">This permanently removes the shared pack and cannot be undone.</p>
        <dl>
          <div><dt>Pack</dt><dd>{target.packName}</dd></div>
          <div><dt>Author</dt><dd>{target.authorName}</dd></div>
        </dl>
        {submitting ? <p role="status">Deleting…</p> : null}
        {error ? <p className="delete-error" role="alert">{error}</p> : null}
        <div className="delete-dialog-actions">
          <button type="button" disabled={submitting} onClick={onCancel}>
            {error && !retryable ? "Close" : "Cancel"}
          </button>
          {!error || retryable ? (
            <button className="danger-action" type="button" disabled={submitting} onClick={onConfirm}>
              {submitting ? "Deleting…" : "Delete pack"}
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Run tests and commit**

Run `npm test -- src/components/DeleteSharedPackDialog.test.tsx`.

Expected: all dialog tests PASS.

```bash
git add src/components/DeleteSharedPackDialog.tsx src/components/DeleteSharedPackDialog.test.tsx
git commit -m "feat: add shared pack deletion confirmation"
```

### Task 3: Shared Browser Deletion State Machine

**Files:**
- Modify: `src/components/SharedPackBrowser.tsx`
- Modify: `src/components/SharedPackBrowser.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PackRepository.ownsPack`, `deletePack`, `DeleteSharedPackDialog`, and sharing error classes.
- Produces: `SharedPackBrowserProps.onDeletedPack(pack: PublicPack): void`.

- [ ] **Step 1: Add failing ownership and success tests**

Replace the test helper with:

```tsx
function fakeRepository(
  listPacks: PackRepository["listPacks"],
  overrides: Partial<PackRepository> = {}
): PackRepository {
  return {
    ownsPack: vi.fn().mockReturnValue(false),
    listPacks,
    createPack: vi.fn(),
    updatePack: vi.fn(),
    deletePack: vi.fn(),
    reportPack: vi.fn(),
    getPack: vi.fn(),
    ...overrides
  };
}
```

Add:

```tsx
it("shows Delete only for owned packs and removes a confirmed deletion in place", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const other = publicPack("00000000-0000-4000-8000-000000000002", "Other");
  const repository = fakeRepository(vi.fn().mockResolvedValue({ items: [owned, other], nextCursor: null }));
  vi.mocked(repository.ownsPack).mockImplementation((id) => id === owned.id);
  vi.mocked(repository.deletePack).mockResolvedValue(undefined);
  const onDeletedPack = vi.fn();
  render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={onDeletedPack} />);
  await screen.findByRole("heading", { name: "Owned" });
  expect(screen.getByRole("button", { name: "Delete Owned" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Delete Other" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Delete Owned" }));
  expect(screen.getByRole("dialog", { name: "Delete shared pack?" })).toHaveTextContent("Owned");
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await waitFor(() => expect(repository.deletePack).toHaveBeenCalledWith(owned.id));
  expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Deleted “Owned” from Shared Packs.");
  expect(onDeletedPack).toHaveBeenCalledWith(owned);
});
```

Run the browser test.

Expected: FAIL because the prop and Delete UI do not exist.

- [ ] **Step 2: Add failing retry, ownership-loss, and partial-success tests**

Add these tests using the existing `publicPack` and updated `fakeRepository` helpers:

```tsx
import {
  PackOwnershipError,
  PackOwnershipRemovalError,
  SharingConfigurationError,
  SharingResponseError,
  SharingServiceError,
  SharingValidationError
} from "../sharing/errors";
```

```tsx
it("keeps a fixed target and safely retries a service failure", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const repository = fakeRepository(
    vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack)
    .mockRejectedValueOnce(new SharingServiceError("SQL constraint ownership_token_hash"))
    .mockResolvedValueOnce(undefined);
  render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sharing is temporarily unavailable. Please try again."
  );
  expect(screen.getByRole("dialog")).not.toHaveTextContent("constraint");
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await waitFor(() => expect(repository.deletePack).toHaveBeenCalledTimes(2));
  expect(repository.deletePack).toHaveBeenNthCalledWith(1, owned.id);
  expect(repository.deletePack).toHaveBeenNthCalledWith(2, owned.id);
  expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
});
```

```tsx
it("turns lost ownership into a non-retriable safe error", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const repository = fakeRepository(
    vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack).mockRejectedValueOnce(
    new PackOwnershipError("token and hash details")
  );
  render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This browser can no longer delete this pack."
  );
  expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Delete pack" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(repository.ownsPack(owned.id)).toBe(true);
  expect(screen.queryByRole("button", { name: "Delete Owned" })).not.toBeInTheDocument();
});
```

```tsx
it("treats ownership removal failure as non-retriable delete success", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const onDeletedPack = vi.fn();
  const repository = fakeRepository(
    vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack).mockRejectedValueOnce(new PackOwnershipRemovalError(owned.id));
  render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={onDeletedPack} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Deleted “Owned”, but local ownership information could not be removed. The pack is no longer shared."
  );
  expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
  expect(onDeletedPack).toHaveBeenCalledOnce();
  expect(repository.deletePack).toHaveBeenCalledOnce();
  expect(screen.getByText("No shared packs yet.")).toBeInTheDocument();
});
```

Add a fixed-message table using a fresh mount per row:

```tsx
it.each([
  [new SharingConfigurationError("anon key secret"), "Shared pack deletion is not configured."],
  [new SharingValidationError("SQL rejected ownership_token_hash"), "The shared pack deletion request was rejected."],
  [new SharingResponseError("privileged metadata"), "The sharing service returned an invalid response. Please try again."],
  [new SharingServiceError("constraint owner_hash_key"), "Sharing is temporarily unavailable. Please try again."],
  [new Error("raw backend detail"), "Failed to delete shared pack. Please try again."]
])("hides raw deletion details for %s", async (failure, safeMessage) => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const repository = fakeRepository(
    vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack).mockRejectedValueOnce(failure);
  const view = render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(safeMessage);
  expect(screen.getByRole("dialog")).not.toHaveTextContent(failure.message);
  view.unmount();
});
```

Add a same-render guard test:

```tsx
const deletion = deferred<void>();
vi.mocked(repository.deletePack).mockReturnValue(deletion.promise);
await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
const confirm = screen.getByRole("button", { name: "Delete pack" });
act(() => { confirm.click(); confirm.click(); });
expect(repository.deletePack).toHaveBeenCalledTimes(1);
await act(async () => deletion.resolve());
```

Run `npm test -- src/components/SharedPackBrowser.test.tsx`.

Expected: new tests FAIL.

- [ ] **Step 3: Add failing stale-list and unmount tests**

Add:

```tsx
it("does not restore a deleted card from an older refresh response", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const refresh = deferred<PackPage>();
  const repository = fakeRepository(
    vi.fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({ items: [owned], nextCursor: null })
      .mockReturnValueOnce(refresh.promise),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack).mockResolvedValue(undefined);
  render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  act(() => screen.getByRole("button", { name: "Refresh" }).click());
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await waitFor(() => expect(repository.deletePack).toHaveBeenCalledOnce());
  await act(async () => refresh.resolve({ items: [owned], nextCursor: null }));
  await waitFor(() => expect(
    screen.queryByRole("heading", { name: "Owned" })
  ).not.toBeInTheDocument());
});

it("filters a deleted ID from an overlapping append response", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const cursor = { createdAt: owned.createdAt, id: owned.id };
  const append = deferred<PackPage>();
  const repository = fakeRepository(
    vi.fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({ items: [owned], nextCursor: cursor })
      .mockReturnValueOnce(append.promise),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack).mockResolvedValue(undefined);
  render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  act(() => screen.getByRole("button", { name: "Load more" }).click());
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await act(async () => append.resolve({ items: [owned], nextCursor: null }));
  expect(screen.queryByRole("heading", { name: "Owned" })).not.toBeInTheDocument();
});

it("ignores deletion completion after unmount", async () => {
  const owned = publicPack("00000000-0000-4000-8000-000000000001", "Owned");
  const deletion = deferred<void>();
  const onDeletedPack = vi.fn();
  const repository = fakeRepository(
    vi.fn().mockResolvedValue({ items: [owned], nextCursor: null }),
    { ownsPack: vi.fn().mockReturnValue(true) }
  );
  vi.mocked(repository.deletePack).mockReturnValue(deletion.promise);
  const view = render(<SharedPackBrowser getRepository={() => repository}
    onLoadPack={vi.fn()} onDeletedPack={onDeletedPack} />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  view.unmount();
  await act(async () => deletion.resolve());
  expect(onDeletedPack).not.toHaveBeenCalled();
});
```

Temporarily removing the deletion generation comparison must make the unmount assertion fail; restore the guard before continuing.

Run the focused test.

Expected: FAIL until deleted-ID suppression and generation checks exist.

- [ ] **Step 4: Implement safe error mapping**

Add a local mapper that never returns `error.message`:

```ts
function deleteError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof PackOwnershipError) {
    return { message: "This browser can no longer delete this pack.", retryable: false };
  }
  if (error instanceof SharingConfigurationError) {
    return { message: "Shared pack deletion is not configured.", retryable: false };
  }
  if (error instanceof SharingValidationError) {
    return { message: "The shared pack deletion request was rejected.", retryable: false };
  }
  if (error instanceof SharingResponseError) {
    return { message: "The sharing service returned an invalid response. Please try again.", retryable: true };
  }
  if (error instanceof SharingServiceError) {
    return { message: "Sharing is temporarily unavailable. Please try again.", retryable: true };
  }
  return { message: "Failed to delete shared pack. Please try again.", retryable: true };
}
```

Handle `PackOwnershipRemovalError` before this mapper as partial success.

- [ ] **Step 5: Implement the deletion state machine**

Add to `SharedPackBrowserProps`:

```ts
onDeletedPack: (pack: PublicPack) => void;
```

Add `onDeletedPack={vi.fn()}` to every pre-existing `SharedPackBrowser` test render. In `App.tsx`, pass a temporary explicit no-op so the required interface remains type-safe until Task 4 connects fingerprint reconciliation:

```tsx
<SharedPackBrowser
  getRepository={getPackRepository}
  onLoadPack={handleLoadSharedPack}
  onDeletedPack={() => undefined}
/>
```

Add state and refs:

```ts
const [deleteTarget, setDeleteTarget] = useState<PublicPack | null>(null);
const [deleteSubmitting, setDeleteSubmitting] = useState(false);
const [deleteErrorState, setDeleteErrorState] = useState({ message: "", retryable: true });
const [deleteNotice, setDeleteNotice] = useState<{ message: string; warning: boolean } | null>(null);
const deleteTriggerRef = useRef<HTMLButtonElement>(null);
const deleteInFlightRef = useRef(false);
const deleteGenerationRef = useRef(0);
const deletedIdsRef = useRef(new Set<string>());
const ownershipDeniedIdsRef = useRef(new Set<string>());
```

Filter every list result:

```ts
const visibleItems = page.items.filter((pack) => !deletedIdsRef.current.has(pack.id));
```

For replace use `setItems(visibleItems)`. For append use `setItems((current) => [...current, ...visibleItems])`.

Implement completion once:

```ts
const completeDelete = useCallback((target: PublicPack, warning: boolean) => {
  deletedIdsRef.current.add(target.id);
  setItems((current) => current.filter((pack) => pack.id !== target.id));
  setDeleteSubmitting(false);
  setDeleteTarget(null);
  setDeleteErrorState({ message: "", retryable: true });
  setDeleteNotice({
    warning,
    message: warning
      ? `Deleted “${target.packName}”, but local ownership information could not be removed. The pack is no longer shared.`
      : `Deleted “${target.packName}” from Shared Packs.`
  });
  onDeletedPack(target);
}, [onDeletedPack]);
```

Implement confirmation with a synchronous ref and generation check:

```ts
const handleConfirmDelete = useCallback(async () => {
  if (!deleteTarget || deleteInFlightRef.current) return;
  const target = deleteTarget;
  const generation = ++deleteGenerationRef.current;
  deleteInFlightRef.current = true;
  setDeleteSubmitting(true);
  setDeleteErrorState({ message: "", retryable: true });
  try {
    await getRepository().deletePack(target.id);
    if (generation !== deleteGenerationRef.current) return;
    deleteInFlightRef.current = false;
    completeDelete(target, false);
  } catch (error) {
    if (generation !== deleteGenerationRef.current) return;
    deleteInFlightRef.current = false;
    if (error instanceof PackOwnershipRemovalError && error.packId === target.id) {
      completeDelete(target, true);
      return;
    }
    if (error instanceof PackOwnershipError) {
      ownershipDeniedIdsRef.current.add(target.id);
    }
    setDeleteSubmitting(false);
    setDeleteErrorState(deleteError(error));
  }
}, [completeDelete, deleteTarget, getRepository]);
```

On ordinary errors this preserves `deleteTarget`. An ownership error also adds the fixed target ID to `ownershipDeniedIdsRef`, so the rerender and subsequent dialog close keep Delete hidden for the rest of the mounted browser session even if `ownsPack` still returns `true`.

On component cleanup, increment both list and delete generations. Do not call `completeDelete` after unmount.

Replace the existing list-loading effect cleanup with:

```ts
useEffect(() => {
  void loadFirstPage();
  return () => {
    generationRef.current += 1;
    deleteGenerationRef.current += 1;
  };
}, [loadFirstPage]);
```

Render card action:

```tsx
{getRepository().ownsPack(pack.id) &&
 !ownershipDeniedIdsRef.current.has(pack.id) ? (
  <button
    className="shared-delete-action"
    type="button"
    aria-label={`Delete ${pack.packName}`}
    onClick={(event) => {
      deleteTriggerRef.current = event.currentTarget;
      setDeleteErrorState({ message: "", retryable: true });
      setDeleteTarget(pack);
    }}
  >
    Delete
  </button>
) : null}
```

After deletion, render `No shared packs yet.` only when `items.length === 0 && nextCursor === null`. Render append errors and `Load more` independently of whether the loaded item grid is empty. When deletion removes the last loaded card but `nextCursor` remains non-null, preserve the deletion notice and `Load more`; do not fetch automatically.

Render the notice before the grid:

```tsx
{deleteNotice ? (
  <div
    className={deleteNotice.warning
      ? "shared-delete-notice warning"
      : "shared-delete-notice"}
    role="status"
  >
    {deleteNotice.message}
  </div>
) : null}
```

Render the fixed dialog after list content:

```tsx
{deleteTarget ? (
  <DeleteSharedPackDialog
    target={deleteTarget}
    submitting={deleteSubmitting}
    error={deleteErrorState.message}
    retryable={deleteErrorState.retryable}
    trigger={deleteTriggerRef}
    onCancel={() => {
      if (deleteInFlightRef.current) return;
      setDeleteErrorState({ message: "", retryable: true });
      setDeleteTarget(null);
    }}
    onConfirm={() => void handleConfirmDelete()}
  />
) : null}
```

Keep the existing load and pagination behavior unchanged except for filtering returned IDs.

- [ ] **Step 6: Run focused and full tests**

Run:

```bash
npm test -- src/components/DeleteSharedPackDialog.test.tsx src/components/SharedPackBrowser.test.tsx
npm test -- --maxWorkers=1
```

Expected: all tests PASS with no leaked raw error text.

- [ ] **Step 7: Commit the browser workflow**

```bash
git add src/components/SharedPackBrowser.tsx src/components/SharedPackBrowser.test.tsx src/App.tsx
git commit -m "feat: delete owned packs from shared browser"
```

### Task 4: App Publication Fingerprint Reconciliation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `SharedPackBrowser.onDeletedPack(pack)` and existing editable fingerprint helpers.
- Produces: conditional clearing of `lastPublishedFingerprint`.

- [ ] **Step 1: Add failing identical and unrelated deletion tests**

Add these tests after Task 1 has added `ownsPack` to `sharingRepository`:

```tsx
import { toEditablePack } from "./sharing/editablePack";
```

```tsx
it("re-enables Publish after deleting the identical last-published pack", async () => {
  const published = createdPublicPack(toEditablePack(createDefaultPack()));
  const repository = sharingRepository(published);
  vi.mocked(repository.ownsPack).mockReturnValue(true);
  vi.mocked(repository.createPack).mockResolvedValue(published);
  vi.mocked(repository.deletePack).mockResolvedValue(undefined);
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  await userEvent.click(await screen.findByRole("button", { name: "View Shared Packs" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete Untitled Pack" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await userEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
});
```

```tsx
it("keeps Publish disabled after deleting a different owned pack", async () => {
  const other = sharedPack("Different Owned Pack");
  const repository = sharingRepository(other);
  vi.mocked(repository.ownsPack).mockReturnValue(true);
  vi.mocked(repository.createPack).mockImplementation(async (pack) => createdPublicPack(pack));
  vi.mocked(repository.deletePack).mockResolvedValue(undefined);
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  await userEvent.click(await screen.findByRole("button", { name: "View Shared Packs" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete Different Owned Pack" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await userEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
});
```

Add an independent state-preservation test:

```tsx
it("preserves Editor and SEQTRAK state while deleting an owned pack", async () => {
  const repository = sharingRepository(sharedPack("Owned"));
  vi.mocked(repository.ownsPack).mockReturnValue(true);
  vi.mocked(repository.deletePack).mockResolvedValue(undefined);
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
  await userEvent.selectOptions(screen.getByLabelText("Target track"), "8");
  await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
  act(() => midiMocks.keyCallback?.(1));
  await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
  await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete Owned" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));
  await userEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByText("Status: connected")).toBeInTheDocument();
  expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument();
  expect(screen.getByLabelText("Input Port")).toHaveValue("input-1");
  expect(screen.getByLabelText("Output Port")).toHaveValue("output-1");
  expect(screen.getByLabelText("Target track")).toHaveValue("8");
  expect(screen.getByDisplayValue("Imported SYNTH1 Scale 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Slot 2 Dm" })).toHaveClass("selected");
  expect(screen.getByRole("button", { name: "D#4" })).toHaveAttribute("aria-pressed", "true");
  expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
});
```

Run `npm test -- src/App.test.tsx`.

Expected: FAIL because App receives no deletion callback.

- [ ] **Step 2: Implement conditional fingerprint clearing**

Add:

```tsx
const handleDeletedSharedPack = useCallback((pack: PublicPack) => {
  const deletedFingerprint = editablePackFingerprint(toEditablePack(sharedPackToChordPack(pack)));
  setLastPublishedFingerprint((current) =>
    current === deletedFingerprint ? null : current
  );
}, []);
```

Pass it to the browser:

```tsx
<SharedPackBrowser
  getRepository={getPackRepository}
  onLoadPack={handleLoadSharedPack}
  onDeletedPack={handleDeletedSharedPack}
/>
```

Do not dispatch an editor action and do not touch MIDI, SCALE, or device state.

- [ ] **Step 3: Run tests and commit**

Run:

```bash
npm test -- src/App.test.tsx src/components/SharedPackBrowser.test.tsx
```

Expected: all related tests PASS.

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: restore publish eligibility after deletion"
```

### Task 5: Delete Styling, Security Audit, and Release Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/DeleteSharedPackDialog.test.tsx`

**Interfaces:**
- Consumes: `.shared-delete-action`, `.delete-dialog`, `.delete-dialog-card`, `.delete-dialog-actions`, `.delete-error`, `.shared-delete-notice`, and `.danger-action`.
- Produces: responsive, visible, and scoped delete presentation.

- [ ] **Step 1: Add dialog and action CSS hook assertions**

Assert:

```tsx
expect(screen.getByRole("dialog")).toHaveClass("delete-dialog");
expect(screen.getByRole("heading", { name: "Delete shared pack?" }).parentElement)
  .toHaveClass("delete-dialog-card");
expect(screen.getByRole("button", { name: "Delete pack" })).toHaveClass("danger-action");
```

Run the dialog test and verify the component contract passes. Run `rg -n "delete-dialog|shared-delete-action|shared-delete-notice" src/styles.css`; expected no style rules before implementation.

- [ ] **Step 2: Add scoped styles**

Use the Reset dialog geometry without changing its selectors:

```css
.shared-browser .shared-delete-action,
.delete-dialog .danger-action {
  border-color: #ef4444;
  background: #7f1d1d;
  color: #ffffff;
}

.delete-dialog button {
  background: #ffffff;
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  color: #1b1c1f;
  cursor: pointer;
  min-height: 38px;
  padding: 7px 11px;
}

.delete-dialog {
  width: min(34rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  padding: 0;
  border: 0;
  background: transparent;
}

.delete-dialog::backdrop {
  background: rgb(2 8 23 / 72%);
}

.delete-dialog-card {
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.5rem;
  border: 1px solid #cfd6e2;
  border-radius: 1rem;
  background: #ffffff;
  color: #1b1c1f;
}

.delete-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.delete-dialog button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.delete-error {
  color: #991b1b;
}

.shared-delete-notice {
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  color: #065f46;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

.shared-delete-notice.warning {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}

@media (max-width: 460px) {
  .shared-browser .shared-delete-action,
  .delete-dialog-actions button {
    width: 100%;
  }
  .delete-dialog-actions {
    flex-direction: column;
  }
}
```

Do not suppress native focus outlines.

- [ ] **Step 3: Run the complete verification matrix**

Run:

```bash
npm test -- --maxWorkers=1
npm run test:deployment
npm run test:server
npm run build
git diff --check
git status --short
```

Expected: frontend, deployment, server, and build PASS; diff check and status are clean after commit.

- [ ] **Step 4: Run security and scope audits**

Run:

```bash
rg -n "error\.message|ownership_token|ownership_token_hash|anon.key|constraint|SQL" src/components/SharedPackBrowser.tsx src/components/DeleteSharedPackDialog.tsx
rg -n "deletePack|ownsPack|onDeletedPack" src/App.tsx src/components/SharedPackBrowser.tsx src/sharing
git diff --stat HEAD~5..HEAD
```

Confirm Delete UI contains no raw-error rendering or secret-bearing fields; only the approved files changed; no migration, dependency, update UI, report UI, bulk delete, or owned-packs view was added.

- [ ] **Step 5: Commit styling**

```bash
git add src/styles.css src/components/DeleteSharedPackDialog.test.tsx
git commit -m "style: add responsive shared pack deletion"
```
