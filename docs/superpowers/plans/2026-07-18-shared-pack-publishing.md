# Shared Pack Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current Editor chord pack as a confirmed, independent shared snapshot while preserving all Editor and SEQTRAK state.

**Architecture:** Add a pure snapshot/validation/fingerprint boundary, model post-create ownership-storage failure as typed partial success, and orchestrate publication in `App`. A controlled native-dialog component renders the fixed snapshot and accessibility behavior without knowing Supabase.

**Tech Stack:** React, TypeScript, native HTML dialog, Vite, Vitest, Testing Library, existing Supabase `PackRepository`, CSS.

## Global Constraints

- Publishing creates an independent snapshot and never attaches the returned public ID to the Editor.
- The snapshot excludes SEQTRAK KEY offset, SCALE, selected slot, MIDI state, report count, hidden/deleted state, timestamps, and ownership values.
- Every publication requires the in-application confirmation dialog.
- `PackRepository.createPack(snapshot)` is called exactly once per confirmed attempt.
- A successful snapshot cannot be republished until its content changes; restoring the exact content disables it again.
- Duplicate-publication state is in memory only and resets on page reload.
- Success stays in Editor and shows `View Shared Packs`.
- Publication must not change pack contents, selected slot, SCALE, ports, target track, MIDI connection, or live KEY.
- Ownership-storage failure after server creation is successful publication with a warning and no retry.
- No ownership token, anon key, SQL text, ownership hash, or privileged metadata may enter UI errors.
- No update, delete, report, search, filter, or ranking UI is included.
- No automated production record creation and no new dependencies.

---

## File Map

- Create `src/sharing/editablePack.ts` and test: snapshot mapping, validation, fingerprint.
- Modify sharing errors/repository/test: ownership-save partial success.
- Create `src/components/PublishPackDialog.tsx` and test: modal summary and focus/closing rules.
- Modify `src/App.tsx` and test: guarded create flow, duplicate prevention, notices, navigation, lifecycle.
- Modify `src/styles.css`: responsive publication presentation.

---

### Task 1: Editable Snapshot, Validation, and Fingerprint

**Files:**
- Create: `src/sharing/editablePack.ts`
- Create: `src/sharing/editablePack.test.ts`

**Interfaces:**
- Consumes: `ChordPack`, `chromaticKeys`, `validatePack`, and `EditablePack`.
- Produces: `toEditablePack(pack: ChordPack): EditablePack`, `validateEditablePack(pack: EditablePack): string[]`, `editablePackFingerprint(pack: EditablePack): string`.

- [ ] **Step 1: Write failing mapping and fingerprint tests**

Create `src/sharing/editablePack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultPack, type ChordPack } from "../domain/music";
import {
  editablePackFingerprint,
  toEditablePack,
  validateEditablePack
} from "./editablePack";
import type { EditablePack } from "./types";

function localPack(): ChordPack {
  return {
    ...createDefaultPack(),
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T00:00:00.000Z",
    reportedCount: 4,
    hidden: true,
    deleted: true,
    sourceTrackIndex: 8,
    tags: ["pop", "bright"]
  };
}

it("copies only editable fields and deeply clones mutable data", () => {
  const source = localPack();
  const result = toEditablePack(source);
  expect(result).toEqual({
    packName: "Untitled Pack",
    authorName: "Anonymous",
    tags: ["pop", "bright"],
    key: "C",
    trackSoundName: "Unknown sound",
    sourceTrackIndex: 8,
    chords: source.chords
  });
  for (const field of ["id", "createdAt", "reportedCount", "hidden", "deleted"]) {
    expect(result).not.toHaveProperty(field);
  }
  result.tags.push("local");
  result.chords[0].displayName = "Local";
  result.chords[0].notes.push(71);
  expect(source.tags).toEqual(["pop", "bright"]);
  expect(source.chords[0]).toEqual({ slotIndex: 1, notes: [60, 64, 67], displayName: "C" });
});

it("omits an absent source track", () => {
  const source = localPack();
  delete source.sourceTrackIndex;
  expect(toEditablePack(source)).not.toHaveProperty("sourceTrackIndex");
});

it("uses canonical content for changed and restored fingerprints", () => {
  const original = toEditablePack(localPack());
  const reordered = {
    chords: original.chords,
    trackSoundName: original.trackSoundName,
    key: original.key,
    tags: original.tags,
    authorName: original.authorName,
    packName: original.packName,
    sourceTrackIndex: original.sourceTrackIndex
  } as EditablePack;
  expect(editablePackFingerprint(reordered)).toBe(editablePackFingerprint(original));
  reordered.packName = "Changed";
  expect(editablePackFingerprint(reordered)).not.toBe(editablePackFingerprint(original));
  reordered.packName = original.packName;
  expect(editablePackFingerprint(reordered)).toBe(editablePackFingerprint(original));
});
```

- [ ] **Step 2: Add exact sharing validation tests**

Append:

```ts
describe("validateEditablePack", () => {
  const valid = () => toEditablePack(localPack());

  it("accepts a valid snapshot", () => {
    expect(validateEditablePack(valid())).toEqual([]);
  });

  it.each([
    [(pack: EditablePack) => { pack.packName = ""; }, "Pack name is required."],
    [(pack: EditablePack) => { pack.authorName = " Author"; }, "Author must not start or end with a space."],
    [(pack: EditablePack) => { pack.trackSoundName = `${"🎹".repeat(100)}x`; }, "Track sound must contain no more than 100 code points."],
    [(pack: EditablePack) => { pack.tags = ["tag "]; }, "Tags must not start or end with a space."],
    [(pack: EditablePack) => { pack.chords[0].displayName = ""; }, "Chord name is required."],
    [(pack: EditablePack) => { pack.sourceTrackIndex = 10; }, "Source track must be an integer from 0 to 9."]
  ])("rejects an invalid shared field", (mutate, message) => {
    const pack = valid();
    mutate(pack);
    expect(validateEditablePack(pack)).toContain(message);
  });

  it("rejects excessive, duplicate, and overlong tags", () => {
    const tooMany = valid();
    tooMany.tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    expect(validateEditablePack(tooMany)).toContain("A shared pack can contain up to 10 tags.");
    const duplicate = valid();
    duplicate.tags = ["pop", "pop"];
    expect(validateEditablePack(duplicate)).toContain("Tags must be unique.");
    const overlong = valid();
    overlong.tags = ["🎹".repeat(31)];
    expect(validateEditablePack(overlong)).toContain("Tags must contain no more than 30 code points.");
  });

  it("rejects invalid key, slots, and notes", () => {
    const key = valid();
    key.key = "H" as EditablePack["key"];
    expect(validateEditablePack(key)).toContain("Key must be a chromatic note name.");
    const slots = valid();
    slots.chords = slots.chords.slice(0, 6);
    expect(validateEditablePack(slots)).toContain("Pack must contain exactly seven chord slots.");
    const notes = valid();
    notes.chords[0].notes = [];
    expect(validateEditablePack(notes)).toContain("Chord must contain at least one note.");
  });
});
```

- [ ] **Step 3: Run RED**

```bash
npx vitest run --config vite.config.ts src/sharing/editablePack.test.ts
```

Expected: FAIL because `./editablePack` does not exist.

- [ ] **Step 4: Implement the pure boundary**

Create `src/sharing/editablePack.ts`:

```ts
import { chromaticKeys, validatePack, type ChordPack } from "../domain/music";
import type { EditablePack } from "./types";

function snapshot(pack: EditablePack | ChordPack): EditablePack {
  const result: EditablePack = {
    packName: pack.packName,
    authorName: pack.authorName,
    tags: [...pack.tags],
    key: pack.key,
    trackSoundName: pack.trackSoundName,
    chords: pack.chords.map((chord) => ({
      slotIndex: chord.slotIndex,
      notes: [...chord.notes],
      displayName: chord.displayName
    }))
  };
  if (pack.sourceTrackIndex !== undefined) result.sourceTrackIndex = pack.sourceTrackIndex;
  return result;
}

export function toEditablePack(pack: ChordPack): EditablePack {
  return snapshot(pack);
}

function textErrors(label: string, value: string, max: number): string[] {
  if ([...value].length === 0) return [`${label} is required.`];
  const errors: string[] = [];
  if (value.startsWith(" ") || value.endsWith(" ")) {
    errors.push(`${label} must not start or end with a space.`);
  }
  if ([...value].length > max) {
    errors.push(`${label} must contain no more than ${max} code points.`);
  }
  return errors;
}

export function validateEditablePack(pack: EditablePack): string[] {
  const errors = [
    ...textErrors("Pack name", pack.packName, 100),
    ...textErrors("Author", pack.authorName, 50),
    ...textErrors("Track sound", pack.trackSoundName, 100)
  ];
  for (const tag of pack.tags) errors.push(...textErrors("Tags", tag, 30));
  for (const chord of pack.chords) errors.push(...textErrors("Chord name", chord.displayName, 100));
  if (pack.tags.length > 10) errors.push("A shared pack can contain up to 10 tags.");
  if (new Set(pack.tags).size !== pack.tags.length) errors.push("Tags must be unique.");
  if (!chromaticKeys.includes(pack.key)) errors.push("Key must be a chromatic note name.");
  if (pack.sourceTrackIndex !== undefined && (
    !Number.isInteger(pack.sourceTrackIndex) || pack.sourceTrackIndex < 0 || pack.sourceTrackIndex > 9
  )) errors.push("Source track must be an integer from 0 to 9.");
  errors.push(...validatePack({
    ...snapshot(pack), reportedCount: 0, hidden: false, deleted: false
  }));
  return errors;
}

export function editablePackFingerprint(pack: EditablePack): string {
  return JSON.stringify(snapshot(pack));
}
```

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run --config vite.config.ts src/sharing/editablePack.test.ts
npm test
git add src/sharing/editablePack.ts src/sharing/editablePack.test.ts
git commit -m "feat: create validated publication snapshots"
```

Expected: focused and full frontend tests PASS.

---

### Task 2: Ownership Persistence Partial Success

**Files:**
- Modify: `src/sharing/errors.ts`
- Modify: `src/sharing/supabasePackRepository.ts`
- Modify: `src/sharing/supabasePackRepository.test.ts`

**Interfaces:**
- Produces `PackOwnershipPersistenceError` with readonly `createdPack: PublicPack` and no token-bearing message/cause.

- [ ] **Step 1: Write the failing repository test**

Import `PackOwnershipPersistenceError`, then add:

```ts
it("reports ownership persistence failure as token-free partial success", async () => {
  const client = new FakeRpcClient();
  const ownership = new MemoryPackOwnershipStore();
  vi.spyOn(ownership, "save").mockImplementation(() => {
    throw new Error(`Storage rejected ${TOKEN}`);
  });
  const repository = new SupabasePackRepository(client, ownership, { generateToken: () => TOKEN });
  client.responses.push({ data: publicPack, error: null });
  const error = await repository.createPack(editable).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(PackOwnershipPersistenceError);
  expect(error).toMatchObject({
    message: "The pack was published, but browser ownership could not be saved.",
    createdPack: publicPack
  });
  expect(JSON.stringify(error)).not.toContain(TOKEN);
  expect((error as Error & { cause?: Error }).cause?.message).not.toContain(TOKEN);
  expect(client.calls).toHaveLength(1);
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run --config vite.config.ts src/sharing/supabasePackRepository.test.ts
```

Expected: FAIL because the typed error is absent and the raw storage error escapes.

- [ ] **Step 3: Implement safe partial success**

Add to `src/sharing/errors.ts`:

```ts
import type { PublicPack } from "./types";

export class PackOwnershipPersistenceError extends Error {
  readonly createdPack: PublicPack;
  constructor(createdPack: PublicPack) {
    super("The pack was published, but browser ownership could not be saved.");
    this.name = "PackOwnershipPersistenceError";
    this.createdPack = createdPack;
    Object.defineProperty(this, "cause", {
      value: new Error("Browser storage rejected the ownership record.")
    });
  }
}
```

Import the error in `supabasePackRepository.ts`, then replace the save tail:

```ts
const created = parsePublicPack(data);
try {
  this.ownership.save(created.id, token);
} catch {
  throw new PackOwnershipPersistenceError(created);
}
return created;
```

- [ ] **Step 4: Run GREEN and commit**

```bash
npx vitest run --config vite.config.ts src/sharing/supabasePackRepository.test.ts
npm test
git add src/sharing/errors.ts src/sharing/supabasePackRepository.ts src/sharing/supabasePackRepository.test.ts
git commit -m "feat: model published packs without saved ownership"
```

Expected: focused and full tests PASS with no token in test output.

---

### Task 3: Accessible Publish Confirmation Dialog

**Files:**
- Create: `src/components/PublishPackDialog.tsx`
- Create: `src/components/PublishPackDialog.test.tsx`

**Interfaces:**
- Consumes `{ snapshot: EditablePack; submitting: boolean; error: string; trigger: RefObject<HTMLButtonElement | null>; onCancel(): void; onConfirm(): void }`.
- Produces a native modal dialog with fixed summary, closing rules, status/alert regions, and focus restoration.

- [ ] **Step 1: Write the failing dialog tests**

Create `src/components/PublishPackDialog.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { toEditablePack } from "../sharing/editablePack";
import { PublishPackDialog } from "./PublishPackDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() { this.setAttribute("open", ""); }
  });
});

function setup(submitting = false, error = "") {
  const snapshot = toEditablePack({
    ...createDefaultPack(), packName: "Publish Me", authorName: "Ada",
    tags: ["pop", "bright"], key: "D", trackSoundName: "Warm Pad"
  });
  const trigger = createRef<HTMLButtonElement>();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = render(<>
    <button ref={trigger}>Publish trigger</button>
    <PublishPackDialog snapshot={snapshot} submitting={submitting} error={error}
      trigger={trigger} onCancel={onCancel} onConfirm={onConfirm} />
  </>);
  return { ...view, onCancel, onConfirm, trigger };
}

it("shows the fixed snapshot and focuses a labelled modal", () => {
  setup();
  expect(screen.getByRole("dialog", { name: "Publish shared pack" })).toHaveAttribute("open");
  expect(screen.getByRole("heading", { name: "Publish shared pack" })).toHaveFocus();
  for (const text of ["Publish Me", "Ada", "KEY D", "Warm Pad", "pop, bright"]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  for (const chord of createDefaultPack().chords) {
    expect(screen.getByText(chord.displayName)).toBeInTheDocument();
  }
  expect(screen.getByText(/independent snapshot/i)).toBeInTheDocument();
});

it("cancels by button, Escape, and backdrop", async () => {
  const button = setup();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(button.onCancel).toHaveBeenCalledTimes(1);
  button.unmount();
  const escape = setup();
  fireEvent.cancel(screen.getByRole("dialog"));
  expect(escape.onCancel).toHaveBeenCalledTimes(1);
  escape.unmount();
  const backdrop = setup();
  fireEvent.click(screen.getByRole("dialog"));
  expect(backdrop.onCancel).toHaveBeenCalledTimes(1);
});

it("blocks close while submitting and announces progress", () => {
  const { onCancel } = setup(true);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Publishing…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Publishing…");
  fireEvent.cancel(screen.getByRole("dialog"));
  fireEvent.click(screen.getByRole("dialog"));
  expect(onCancel).not.toHaveBeenCalled();
});

it("shows an error alert and restores trigger focus on unmount", () => {
  const view = setup(false, "Sharing is unavailable.");
  expect(screen.getByRole("alert")).toHaveTextContent("Sharing is unavailable.");
  view.rerender(<button ref={view.trigger}>Publish trigger</button>);
  expect(view.trigger.current).toHaveFocus();
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run --config vite.config.ts src/components/PublishPackDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled dialog**

Create `src/components/PublishPackDialog.tsx`:

```tsx
import { useEffect, useRef, type RefObject } from "react";
import type { EditablePack } from "../sharing/types";

export interface PublishPackDialogProps {
  snapshot: EditablePack;
  submitting: boolean;
  error: string;
  trigger: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PublishPackDialog({
  snapshot, submitting, error, trigger, onCancel, onConfirm
}: PublishPackDialogProps) {
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
    <dialog className="publish-dialog" ref={dialogRef}
      aria-labelledby="publish-dialog-title" aria-describedby="publish-dialog-description"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onCancel(); }}
      onClick={(event) => {
        if (!submitting && event.target === event.currentTarget) onCancel();
      }}>
      <div className="publish-dialog-card">
        <h2 id="publish-dialog-title" ref={headingRef} tabIndex={-1}>Publish shared pack</h2>
        <p id="publish-dialog-description">
          This publishes an independent snapshot and does not link it to the current Editor.
        </p>
        <dl className="publish-summary">
          <div><dt>Pack</dt><dd>{snapshot.packName}</dd></div>
          <div><dt>Author</dt><dd>{snapshot.authorName}</dd></div>
          <div><dt>Key</dt><dd>KEY {snapshot.key}</dd></div>
          <div><dt>Sound</dt><dd>{snapshot.trackSoundName}</dd></div>
          <div><dt>Tags</dt><dd>{snapshot.tags.length ? snapshot.tags.join(", ") : "None"}</dd></div>
        </dl>
        <ol className="publish-chords">
          {snapshot.chords.map((chord) => <li key={chord.slotIndex}>{chord.displayName}</li>)}
        </ol>
        {submitting ? <p role="status">Publishing…</p> : null}
        {error ? <p className="publish-error" role="alert">{error}</p> : null}
        <div className="publish-dialog-actions">
          <button type="button" disabled={submitting} onClick={onCancel}>Cancel</button>
          <button type="button" disabled={submitting} onClick={onConfirm}>
            {submitting ? "Publishing…" : "Publish shared pack"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Run GREEN and commit**

```bash
npx vitest run --config vite.config.ts src/components/PublishPackDialog.test.tsx
npm test
git add src/components/PublishPackDialog.tsx src/components/PublishPackDialog.test.tsx
git commit -m "feat: add shared pack publication dialog"
```

Expected: dialog and full frontend tests PASS without focus/act warnings.

---

### Task 4: App Publication Workflow and Duplicate Guard

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes Tasks 1–3 and existing `getPackRepository()`.
- Produces Editor `Publish`, guarded create/retry/partial-success flow, duplicate fingerprint, notices, and refreshed navigation.

- [ ] **Step 1: Add failing App publication tests**

Add `fireEvent` to the Testing Library import, plus `PackOwnershipPersistenceError` and `EditablePack` imports. Add a helper:

```ts
function createdPublicPack(editable: EditablePack): PublicPack {
  return {
    ...editable,
    id: "00000000-0000-4000-8000-000000000099",
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    reportedCount: 0
  };
}
```

Stub `showModal` in `beforeEach`, then append:

```tsx
it("validates before opening publication confirmation", async () => {
  const repository = sharingRepository(sharedPack());
  renderApp(<App packRepository={repository} />);
  await userEvent.clear(screen.getByLabelText("Pack name"));
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Pack name is required.")).toBeInTheDocument();
  expect(repository.createPack).not.toHaveBeenCalled();
});

it("cancels without publishing or changing selection", async () => {
  const repository = sharingRepository(sharedPack());
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(repository.createPack).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Slot 2 Dm" })).toHaveClass("selected");
});

it("publishes once, stays in Editor, and blocks exact successful content", async () => {
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockImplementation(async (editable) => createdPublicPack(editable));
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  await waitFor(() => expect(repository.createPack).toHaveBeenCalledTimes(1));
  expect(screen.getByText("Published “Untitled Pack” to Shared Packs.")).toBeInTheDocument();
  expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(screen.getByText("This version is already shared.")).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Pack name"));
  await userEvent.type(screen.getByLabelText("Pack name"), "Changed");
  expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  await userEvent.clear(screen.getByLabelText("Pack name"));
  await userEvent.type(screen.getByLabelText("Pack name"), "Untitled Pack");
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
});

it("retries the same snapshot and synchronously guards duplicate submit", async () => {
  const pending = deferred<PublicPack>();
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack)
    .mockRejectedValueOnce(new Error("Sharing is unavailable."))
    .mockReturnValueOnce(pending.promise);
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sharing is unavailable.");
  const retry = screen.getByRole("button", { name: "Publish shared pack" });
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(repository.createPack).toHaveBeenCalledTimes(2);
  expect(vi.mocked(repository.createPack).mock.calls[1][0])
    .toEqual(vi.mocked(repository.createPack).mock.calls[0][0]);
  await act(async () => pending.resolve(createdPublicPack(
    vi.mocked(repository.createPack).mock.calls[1][0]
  )));
});

it("treats ownership-save failure as published without retry", async () => {
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockImplementation(async (editable) => {
    throw new PackOwnershipPersistenceError(createdPublicPack(editable));
  });
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  expect(await screen.findByText(
    "Published “Untitled Pack”, but ownership could not be saved. This browser cannot update or delete it later."
  )).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(repository.createPack).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add navigation, MIDI invariants, and unmount tests**

```tsx
it("opens a refreshed Shared Packs view after success", async () => {
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockImplementation(async (editable) => createdPublicPack(editable));
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  await userEvent.click(await screen.findByRole("button", { name: "View Shared Packs" }));
  await waitFor(() => expect(repository.listPacks).toHaveBeenCalledWith({ limit: 20 }));
  expect(screen.getByRole("heading", { name: "Shared Packs" })).toBeInTheDocument();
});

it("preserves MIDI, KEY, SCALE, track, pack, and slot while publishing", async () => {
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockImplementation(async (editable) => createdPublicPack(editable));
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
  act(() => midiMocks.keyCallback?.(1));
  await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  await screen.findByText(/Published/);
  expect(screen.getByText("Status: connected")).toBeInTheDocument();
  expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument();
  expect(screen.getByLabelText("Input Port")).toHaveValue("input-1");
  expect(screen.getByLabelText("Output Port")).toHaveValue("output-1");
  expect(screen.getByLabelText("Target track")).toHaveValue("7");
  expect(screen.getByDisplayValue("Imported SYNTH1 Scale 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Slot 2 Dm" })).toHaveClass("selected");
  expect(screen.getByRole("button", { name: "C#4" })).toHaveAttribute("aria-pressed", "true");
  expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
});

it("ignores publication completion after unmount", async () => {
  const pending = deferred<PublicPack>();
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockReturnValueOnce(pending.promise);
  const view = renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  view.unmount();
  await act(async () => pending.resolve(createdPublicPack(
    vi.mocked(repository.createPack).mock.calls[0][0]
  )));
  expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run RED**

```bash
npx vitest run --config vite.config.ts src/App.test.tsx
```

Expected: new tests FAIL because no `Publish` workflow exists.

- [ ] **Step 4: Implement App publication state and handlers**

Import `useMemo`, `PublishPackDialog`, Task 1 functions, `PackOwnershipPersistenceError`, and `EditablePack`. Add:

```tsx
const [publicationSnapshot, setPublicationSnapshot] = useState<EditablePack | null>(null);
const [publicationSubmitting, setPublicationSubmitting] = useState(false);
const [publicationError, setPublicationError] = useState("");
const [publicationNotice, setPublicationNotice] = useState<{ message: string; warning: boolean } | null>(null);
const [lastPublishedFingerprint, setLastPublishedFingerprint] = useState<string | null>(null);
const publishTriggerRef = useRef<HTMLButtonElement>(null);
const publicationGenerationRef = useRef(0);
const publicationInFlightRef = useRef(false);
const currentEditablePack = useMemo(() => toEditablePack(state.pack), [state.pack]);
const currentPublicationFingerprint = useMemo(
  () => editablePackFingerprint(currentEditablePack), [currentEditablePack]
);
const alreadyPublished = lastPublishedFingerprint === currentPublicationFingerprint;

useEffect(() => () => { publicationGenerationRef.current += 1; }, []);

const handleOpenPublish = useCallback(() => {
  const next = toEditablePack(state.pack);
  const errors = validateEditablePack(next);
  if (errors.length) {
    dispatch({ type: "setMessage", message: errors[0] });
    return;
  }
  setPublicationError("");
  setPublicationSnapshot(next);
}, [state.pack]);

const handleCancelPublish = useCallback(() => {
  if (publicationInFlightRef.current) return;
  setPublicationError("");
  setPublicationSnapshot(null);
}, []);

const completePublication = useCallback((next: EditablePack, warning: boolean) => {
  setLastPublishedFingerprint(editablePackFingerprint(next));
  setPublicationSubmitting(false);
  setPublicationError("");
  setPublicationSnapshot(null);
  setPublicationNotice({
    warning,
    message: warning
      ? `Published “${next.packName}”, but ownership could not be saved. This browser cannot update or delete it later.`
      : `Published “${next.packName}” to Shared Packs.`
  });
}, []);

const handleConfirmPublish = useCallback(async () => {
  if (!publicationSnapshot || publicationInFlightRef.current) return;
  const next = publicationSnapshot;
  const generation = ++publicationGenerationRef.current;
  publicationInFlightRef.current = true;
  setPublicationSubmitting(true);
  setPublicationError("");
  try {
    await getPackRepository().createPack(next);
    if (generation !== publicationGenerationRef.current) return;
    publicationInFlightRef.current = false;
    completePublication(next, false);
  } catch (error) {
    if (generation !== publicationGenerationRef.current) return;
    publicationInFlightRef.current = false;
    if (error instanceof PackOwnershipPersistenceError) {
      completePublication(next, true);
    } else {
      setPublicationSubmitting(false);
      setPublicationError(error instanceof Error ? error.message : "Failed to publish shared pack.");
    }
  }
}, [completePublication, getPackRepository, publicationSnapshot]);
```

Render `.top-actions` containing the existing navigation and, only in Editor:

```tsx
<div className="publish-trigger-group">
  <button className="publish-trigger" type="button" ref={publishTriggerRef}
    disabled={alreadyPublished} onClick={handleOpenPublish}>Publish</button>
  {alreadyPublished ? <span>This version is already shared.</span> : null}
</div>
```

Render this after the Editor status message:

```tsx
{publicationNotice ? (
  <div className={publicationNotice.warning ? "publication-notice warning" : "publication-notice"}
    role="status">
    <span>{publicationNotice.message}</span>
    <button type="button" onClick={() => setActiveView("shared-packs")}>View Shared Packs</button>
  </div>
) : null}
```

Render before the outer `main` closes:

```tsx
{publicationSnapshot ? (
  <PublishPackDialog snapshot={publicationSnapshot} submitting={publicationSubmitting}
    error={publicationError} trigger={publishTriggerRef}
    onCancel={handleCancelPublish} onConfirm={() => void handleConfirmPublish()} />
) : null}
```

- [ ] **Step 5: Run GREEN, build, and commit**

```bash
npx vitest run --config vite.config.ts src/App.test.tsx src/components/PublishPackDialog.test.tsx src/sharing/editablePack.test.ts src/sharing/supabasePackRepository.test.ts
npm test
npm run build
git add src/App.tsx src/App.test.tsx
git commit -m "feat: publish editor packs as shared snapshots"
```

Expected: selected/full tests PASS and production build exits 0.

---

### Task 5: Responsive Publication Presentation

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/PublishPackDialog.test.tsx`

**Interfaces:**
- Consumes publication class names from App and dialog.
- Produces visible header control, modal/backdrop, long-content containment, notices, and mobile layout.

- [ ] **Step 1: Lock stable styling hooks in the dialog test**

Add to the summary test:

```tsx
expect(screen.getByRole("dialog")).toHaveClass("publish-dialog");
expect(screen.getByRole("heading", { name: "Publish shared pack" }).parentElement)
  .toHaveClass("publish-dialog-card");
```

Run:

```bash
npx vitest run --config vite.config.ts src/components/PublishPackDialog.test.tsx
```

Expected: PASS if Task 3 retained the required hooks; any missing hook fails before CSS work.

- [ ] **Step 2: Add exact publication styles**

Append before media queries in `src/styles.css`:

```css
.top-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

.publish-trigger-group {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.publish-trigger,
.publication-notice button,
.publish-dialog button {
  background: #ffffff;
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  color: #1b1c1f;
  cursor: pointer;
  min-height: 38px;
  padding: 7px 11px;
}

.publish-trigger:disabled,
.publish-dialog button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.publish-trigger-group span {
  color: #687080;
  font-size: 13px;
}

.publication-notice {
  align-items: center;
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  color: #065f46;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

.publication-notice.warning {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}

.publish-dialog {
  background: transparent;
  border: 0;
  max-height: 100vh;
  max-width: min(620px, calc(100vw - 32px));
  padding: 0;
  width: 100%;
}

.publish-dialog::backdrop {
  background: rgb(17 24 39 / 60%);
}

.publish-dialog-card {
  background: #ffffff;
  border-radius: 10px;
  display: grid;
  gap: 16px;
  max-height: calc(100vh - 32px);
  overflow: auto;
  overflow-wrap: anywhere;
  padding: 20px;
}

.publish-dialog-card h2,
.publish-dialog-card p,
.publish-summary,
.publish-chords {
  margin: 0;
}

.publish-summary {
  display: grid;
  gap: 8px;
}

.publish-summary div {
  display: grid;
  gap: 4px;
  grid-template-columns: 90px minmax(0, 1fr);
}

.publish-summary dt {
  color: #4b5565;
  font-weight: 700;
}

.publish-summary dd {
  margin: 0;
  min-width: 0;
}

.publish-chords {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding-left: 22px;
}

.publish-error {
  color: #991b1b;
}

.publish-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
```

Inside `@media (max-width: 820px)` add:

```css
.top-actions {
  align-items: stretch;
  justify-content: flex-start;
}
```

Inside `@media (max-width: 460px)` add:

```css
.top-actions,
.publish-trigger-group,
.publish-trigger,
.publish-dialog-actions,
.publish-dialog-actions button,
.publication-notice button {
  width: 100%;
}

.publish-summary div {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 3: Run verification and commit**

```bash
npx vitest run --config vite.config.ts src/components/PublishPackDialog.test.tsx src/App.test.tsx
npm test
npm run build
git add src/styles.css src/components/PublishPackDialog.test.tsx
git commit -m "style: add responsive publication confirmation"
```

Expected: focused/full tests PASS and production CSS/build succeeds.

---

### Task 6: Final Regression, Security, and Scope Audit

**Files:**
- Modify only if verification exposes an in-scope defect in planned files.

**Interfaces:**
- Consumes Tasks 1–5.
- Produces exact-HEAD verification without creating a production shared record.

- [ ] **Step 1: Run every project check**

```bash
npm test
npm run test:deployment
npm run test:server
npm run build
```

Expected: frontend, deployment, and server suites PASS; production build exits 0.

- [ ] **Step 2: Audit mutation and secret scope**

```bash
rg -n "updatePack|deletePack|reportPack" src/App.tsx src/components/PublishPackDialog.tsx
rg -n "ownership_token|ownershipToken|VITE_SUPABASE_SERVICE|service_role|database password" src/App.tsx src/components/PublishPackDialog.tsx src/sharing/editablePack.ts
rg -n "createPack" src/App.tsx src/components/PublishPackDialog.tsx
git diff --check
git status --short
```

Expected:

- No update/delete/report methods in publication UI.
- No ownership or privileged secret names in UI/snapshot code.
- `createPack` occurs only in App's guarded confirm handler.
- Whitespace and tracked status are clean.

- [ ] **Step 3: Confirm the accepted-design checklist**

```text
[x] Every publication opens a summary confirmation
[x] Snapshot is deep-cloned and excludes device/server/ownership state
[x] Sharing validation runs before dialog/network
[x] Cancel/Escape/backdrop never create a pack
[x] Busy state blocks close and synchronous duplicate submit
[x] Success stays in Editor and exposes View Shared Packs
[x] Exact successful snapshot cannot be republished until changed
[x] Failed attempts retry the same fixed snapshot
[x] Ownership-save partial success has warning and no retry
[x] Pack, slot, SCALE, ports, track, MIDI connection, and KEY are preserved
[x] Stale unmount completion cannot update UI
[x] No update/delete/report/filter/ranking or production test-data creation
```

- [ ] **Step 4: Commit only if an audited defect required correction**

Run the covering focused test first, then:

```bash
git add src/App.tsx src/App.test.tsx src/components/PublishPackDialog.tsx src/components/PublishPackDialog.test.tsx src/sharing/editablePack.ts src/sharing/editablePack.test.ts src/sharing/errors.ts src/sharing/supabasePackRepository.ts src/sharing/supabasePackRepository.test.ts src/styles.css
git commit -m "fix: complete shared pack publication verification"
```

If no correction was required, do not create an empty commit.
