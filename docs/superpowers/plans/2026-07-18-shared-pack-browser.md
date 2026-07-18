# Shared Pack Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only newest-shared-pack browser that can safely load an independent pack copy into the existing editor.

**Architecture:** Keep top-level view and editor/device state in `App`, put asynchronous list state in a focused `SharedPackBrowser`, and retain `PackRepository` as the only backend boundary. Convert `PublicPack` to a deep-cloned local `ChordPack` through a pure mapper before dispatching the existing `replacePack` action.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Supabase repository interface, CSS.

## Global Constraints

- The view switch labels are exactly `Editor` and `Shared Packs`.
- Newest-list page size is exactly 20.
- Every `Load into editor` action requires confirmation before replacing editor contents.
- Loaded packs are independent local copies and retain no shared ID, timestamp, report count, ownership, or update association.
- Loading a shared pack preserves the live SEQTRAK KEY offset and invalidates the previous device-read SCALE.
- Sharing configuration and request failures must not disable the editor or MIDI workflow.
- This slice does not add publishing, shared update/delete, reporting, search, filtering, or popularity sorting.
- Do not add dependencies.

---

## File Map

- Create `src/sharing/sharedPackToChordPack.ts`: pure, deep-copying `PublicPack` to `ChordPack` conversion.
- Create `src/sharing/sharedPackToChordPack.test.ts`: conversion contract and independence tests.
- Create `src/components/SharedPackBrowser.tsx`: list fetching, pagination, refresh, stale-request protection, states, cards, and load callback.
- Create `src/components/SharedPackBrowser.test.tsx`: component behavior against a fake `PackRepository`.
- Modify `src/App.tsx`: view navigation, lazy production repository provider, repository injection, confirmation, conversion, editor replacement, and SCALE invalidation.
- Modify `src/App.test.tsx`: application-level navigation and safe-load integration tests.
- Modify `src/styles.css`: view switch, shared browser states, responsive cards, and action styles.

---

### Task 1: Independent Shared-Pack Conversion

**Files:**
- Create: `src/sharing/sharedPackToChordPack.ts`
- Create: `src/sharing/sharedPackToChordPack.test.ts`

**Interfaces:**
- Consumes: `PublicPack` from `src/sharing/types.ts` and `ChordPack` from `src/domain/music.ts`.
- Produces: `sharedPackToChordPack(pack: PublicPack): ChordPack`.

- [ ] **Step 1: Write the failing conversion tests**

Create `src/sharing/sharedPackToChordPack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultPack } from "../domain/music";
import { sharedPackToChordPack } from "./sharedPackToChordPack";
import type { PublicPack } from "./types";

function createPublicPack(): PublicPack {
  const pack = createDefaultPack();
  return {
    packName: "Community Keys",
    authorName: "Ada",
    tags: ["pop", "bright"],
    key: "D",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 8,
    chords: pack.chords,
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T01:00:00.000Z",
    reportedCount: 3
  };
}

describe("sharedPackToChordPack", () => {
  it("copies only editable fields and applies local defaults", () => {
    const result = sharedPackToChordPack(createPublicPack());

    expect(result).toEqual({
      packName: "Community Keys",
      authorName: "Ada",
      tags: ["pop", "bright"],
      key: "D",
      trackSoundName: "Warm Pad",
      sourceTrackIndex: 8,
      chords: expect.any(Array),
      reportedCount: 0,
      hidden: false,
      deleted: false
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("deep-clones tags, chord slots, and note arrays", () => {
    const source = createPublicPack();
    const result = sharedPackToChordPack(source);

    result.tags.push("local");
    result.chords[0].displayName = "Local edit";
    result.chords[0].notes.push(71);

    expect(source.tags).toEqual(["pop", "bright"]);
    expect(source.chords[0].displayName).not.toBe("Local edit");
    expect(source.chords[0].notes).not.toContain(71);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run --config vite.config.ts src/sharing/sharedPackToChordPack.test.ts
```

Expected: FAIL because `./sharedPackToChordPack` does not exist.

- [ ] **Step 3: Implement the pure converter**

Create `src/sharing/sharedPackToChordPack.ts`:

```ts
import type { ChordPack } from "../domain/music";
import type { PublicPack } from "./types";

export function sharedPackToChordPack(pack: PublicPack): ChordPack {
  const localPack: ChordPack = {
    packName: pack.packName,
    authorName: pack.authorName,
    tags: [...pack.tags],
    key: pack.key,
    trackSoundName: pack.trackSoundName,
    chords: pack.chords.map((chord) => ({
      slotIndex: chord.slotIndex,
      notes: [...chord.notes],
      displayName: chord.displayName
    })),
    reportedCount: 0,
    hidden: false,
    deleted: false
  };
  if (pack.sourceTrackIndex !== undefined) {
    localPack.sourceTrackIndex = pack.sourceTrackIndex;
  }
  return localPack;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run --config vite.config.ts src/sharing/sharedPackToChordPack.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the conversion boundary**

```bash
git add src/sharing/sharedPackToChordPack.ts src/sharing/sharedPackToChordPack.test.ts
git commit -m "feat: map shared packs to local copies"
```

---

### Task 2: Shared-Pack List, Cards, and Initial States

**Files:**
- Create: `src/components/SharedPackBrowser.tsx`
- Create: `src/components/SharedPackBrowser.test.tsx`

**Interfaces:**
- Consumes: `getRepository: () => PackRepository` and `onLoadPack: (pack: PublicPack) => void`.
- Produces: `SharedPackBrowser(props: SharedPackBrowserProps)` with initial load, retry, empty state, and semantic pack cards.

- [ ] **Step 1: Write failing initial-state and card tests**

Create `src/components/SharedPackBrowser.test.tsx` with a complete fake repository and the first behavior group:

```tsx
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import type { PackRepository } from "../sharing/packRepository";
import type { PackPage, PublicPack } from "../sharing/types";
import { SharedPackBrowser } from "./SharedPackBrowser";

function publicPack(id: string, name = "Newest Pack"): PublicPack {
  const local = createDefaultPack();
  return {
    packName: name,
    authorName: "Ada",
    tags: ["pop", "bright"],
    key: "C",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 7,
    chords: local.chords,
    id,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    reportedCount: 0
  };
}

function fakeRepository(listPacks: PackRepository["listPacks"]): PackRepository {
  return {
    listPacks,
    createPack: vi.fn(),
    updatePack: vi.fn(),
    deletePack: vi.fn(),
    reportPack: vi.fn(),
    getPack: vi.fn()
  };
}

describe("SharedPackBrowser initial list", () => {
  it("loads the newest 20 packs and renders card metadata", async () => {
    const pack = publicPack("00000000-0000-4000-8000-000000000001");
    const listPacks = vi.fn<PackRepository["listPacks"]>().mockResolvedValue({
      items: [pack], nextCursor: null
    });

    render(<SharedPackBrowser getRepository={() => fakeRepository(listPacks)} onLoadPack={vi.fn()} />);

    expect(screen.getByText("Loading shared packs…")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Newest Pack" });
    expect(listPacks).toHaveBeenCalledWith({ limit: 20 });
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("KEY C")).toBeInTheDocument();
    expect(screen.getByText("Warm Pad")).toBeInTheDocument();
    expect(screen.getByText("pop")).toBeInTheDocument();
    for (const chord of pack.chords) expect(screen.getByText(chord.displayName)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Newest Pack into editor" })).toBeEnabled();
  });

  it("shows an empty state", async () => {
    const repository = fakeRepository(vi.fn().mockResolvedValue({ items: [], nextCursor: null }));
    render(<SharedPackBrowser getRepository={() => repository} onLoadPack={vi.fn()} />);
    expect(await screen.findByText("No shared packs yet.")).toBeInTheDocument();
  });

  it("shows a safe error and retries the first page", async () => {
    const listPacks = vi.fn<PackRepository["listPacks"]>()
      .mockRejectedValueOnce(new Error("Sharing is unavailable."))
      .mockResolvedValueOnce({ items: [publicPack("00000000-0000-4000-8000-000000000001")], nextCursor: null });
    render(<SharedPackBrowser getRepository={() => fakeRepository(listPacks)} onLoadPack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sharing is unavailable.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Newest Pack" });
    expect(listPacks).toHaveBeenNthCalledWith(2, { limit: 20 });
  });

  it("contains a synchronous repository configuration failure", async () => {
    render(<SharedPackBrowser
      getRepository={() => { throw new Error("Supabase URL and anonymous key are required."); }}
      onLoadPack={vi.fn()}
    />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Supabase URL and anonymous key are required."
    );
  });
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackBrowser.test.tsx
```

Expected: FAIL because `SharedPackBrowser` does not exist.

- [ ] **Step 3: Implement initial loading, retry, empty state, and cards**

Create `src/components/SharedPackBrowser.tsx` with these public types and state transitions:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { PackRepository } from "../sharing/packRepository";
import type { PackCursor, PublicPack } from "../sharing/types";

const PAGE_SIZE = 20;

export interface SharedPackBrowserProps {
  getRepository: () => PackRepository;
  onLoadPack: (pack: PublicPack) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load shared packs.";
}

export function SharedPackBrowser({ getRepository, onLoadPack }: SharedPackBrowserProps) {
  const [items, setItems] = useState<PublicPack[]>([]);
  const [nextCursor, setNextCursor] = useState<PackCursor | null>(null);
  const [replaceState, setReplaceState] = useState<"loading" | "ready" | "error">("loading");
  const [replaceError, setReplaceError] = useState("");
  const [appendState, setAppendState] = useState<"idle" | "loading" | "error">("idle");
  const [appendError, setAppendError] = useState("");
  const generationRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const generation = ++generationRef.current;
    setReplaceState("loading");
    setReplaceError("");
    setAppendState("idle");
    setAppendError("");
    try {
      const page = await getRepository().listPacks({ limit: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setReplaceState("ready");
    } catch (error) {
      if (generation !== generationRef.current) return;
      setReplaceError(errorMessage(error));
      setReplaceState("error");
    }
  }, [getRepository]);

  useEffect(() => {
    void loadFirstPage();
    return () => { generationRef.current += 1; };
  }, [loadFirstPage]);

  return (
    <section className="shared-browser" aria-labelledby="shared-packs-heading">
      <div className="shared-browser-header">
        <div>
          <h2 id="shared-packs-heading">Shared Packs</h2>
          <p>Browse the newest chord packs shared by the community.</p>
        </div>
        <button type="button" onClick={() => void loadFirstPage()}>Refresh</button>
      </div>

      {replaceState === "loading" ? <p role="status">Loading shared packs…</p> : null}
      {replaceState === "error" ? (
        <div className="shared-error" role="alert">
          <p>{replaceError}</p>
          <button type="button" onClick={() => void loadFirstPage()}>Try again</button>
        </div>
      ) : null}
      {replaceState === "ready" && items.length === 0 ? <p>No shared packs yet.</p> : null}
      {replaceState === "ready" && items.length > 0 ? (
        <div className="shared-pack-grid">
          {items.map((pack) => (
            <article className="shared-pack-card panel" key={pack.id}>
              <h3>{pack.packName}</h3>
              <p>{pack.authorName}</p>
              <p>KEY {pack.key}</p>
              <p>{pack.trackSoundName}</p>
              <div className="shared-tag-row">{pack.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <ol className="shared-chord-list">
                {pack.chords.map((chord) => <li key={chord.slotIndex}>{chord.displayName}</li>)}
              </ol>
              <time dateTime={pack.createdAt}>{new Date(pack.createdAt).toLocaleDateString()}</time>
              <button
                type="button"
                aria-label={`Load ${pack.packName} into editor`}
                onClick={() => onLoadPack(pack)}
              >
                Load into editor
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

Keep `nextCursor`, `appendState`, and `appendError` in this task even though Task 3 adds their controls; this locks the state interface used by pagination.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackBrowser.test.tsx
```

Expected: 4 tests PASS. TypeScript may report unused pagination state only during the full build; Task 3 consumes it before the build gate.

- [ ] **Step 5: Commit initial browser behavior**

```bash
git add src/components/SharedPackBrowser.tsx src/components/SharedPackBrowser.test.tsx
git commit -m "feat: browse newest shared packs"
```

---

### Task 3: Pagination, Refresh Replacement, and Stale Requests

**Files:**
- Modify: `src/components/SharedPackBrowser.tsx`
- Modify: `src/components/SharedPackBrowser.test.tsx`

**Interfaces:**
- Consumes: `SharedPackBrowserProps`, `PAGE_SIZE`, first-page state, and `PackCursor` from Task 2.
- Produces: cursor-based append, append retry, replace-style refresh, and stale-completion protection.

- [ ] **Step 1: Add failing pagination and concurrency tests**

Append this helper and behavior group to `src/components/SharedPackBrowser.test.tsx`:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("SharedPackBrowser pagination and refresh", () => {
  it("appends the next cursor page and hides Load more at the end", async () => {
    const cursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001"
    };
    const listPacks = vi.fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({ items: [publicPack(cursor.id, "First")], nextCursor: cursor })
      .mockResolvedValueOnce({
        items: [publicPack("00000000-0000-4000-8000-000000000002", "Second")],
        nextCursor: null
      });
    render(<SharedPackBrowser getRepository={() => fakeRepository(listPacks)} onLoadPack={vi.fn()} />);

    await screen.findByRole("heading", { name: "First" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "Second" });
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    expect(listPacks).toHaveBeenNthCalledWith(2, { limit: 20, cursor });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("preserves cards and retries after append failure", async () => {
    const cursor = {
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001"
    };
    const listPacks = vi.fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({ items: [publicPack(cursor.id, "First")], nextCursor: cursor })
      .mockRejectedValueOnce(new Error("Next page failed."))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<SharedPackBrowser getRepository={() => fakeRepository(listPacks)} onLoadPack={vi.fn()} />);

    await screen.findByRole("heading", { name: "First" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Next page failed.");
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try loading more" }));
    await waitFor(() => expect(listPacks).toHaveBeenCalledTimes(3));
  });

  it("refreshes from the first page and replaces existing cards", async () => {
    const listPacks = vi.fn<PackRepository["listPacks"]>()
      .mockResolvedValueOnce({ items: [publicPack("00000000-0000-4000-8000-000000000001", "Old")], nextCursor: null })
      .mockResolvedValueOnce({ items: [publicPack("00000000-0000-4000-8000-000000000002", "Fresh")], nextCursor: null });
    render(<SharedPackBrowser getRepository={() => fakeRepository(listPacks)} onLoadPack={vi.fn()} />);
    await screen.findByRole("heading", { name: "Old" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    expect(screen.queryByRole("heading", { name: "Old" })).not.toBeInTheDocument();
    expect(listPacks).toHaveBeenLastCalledWith({ limit: 20 });
  });

  it("ignores an older first-page completion", async () => {
    const oldRequest = deferred<PackPage>();
    const listPacks = vi.fn<PackRepository["listPacks"]>()
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ items: [publicPack("00000000-0000-4000-8000-000000000002", "Fresh")], nextCursor: null });
    render(<SharedPackBrowser getRepository={() => fakeRepository(listPacks)} onLoadPack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Fresh" });
    await act(async () => oldRequest.resolve({
      items: [publicPack("00000000-0000-4000-8000-000000000001", "Stale")],
      nextCursor: null
    }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Stale" })).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackBrowser.test.tsx
```

Expected: initial-state tests PASS and pagination tests FAIL because `Load more` and append retry do not exist.

- [ ] **Step 3: Add append behavior and controls**

Inside `SharedPackBrowser`, add this callback after `loadFirstPage`:

```tsx
const loadMore = useCallback(async () => {
  if (!nextCursor || appendState === "loading" || replaceState === "loading") return;
  const generation = generationRef.current;
  const cursor = nextCursor;
  setAppendState("loading");
  setAppendError("");
  try {
    const page = await getRepository().listPacks({ limit: PAGE_SIZE, cursor });
    if (generation !== generationRef.current) return;
    setItems((current) => [...current, ...page.items]);
    setNextCursor(page.nextCursor);
    setAppendState("idle");
  } catch (error) {
    if (generation !== generationRef.current) return;
    setAppendError(errorMessage(error));
    setAppendState("error");
  }
}, [appendState, getRepository, nextCursor, replaceState]);
```

Replace the existing `replaceState === "ready" && items.length > 0` block with this complete fragment:

```tsx
{replaceState === "ready" && items.length > 0 ? (
  <>
    <div className="shared-pack-grid">
      {items.map((pack) => (
        <article className="shared-pack-card panel" key={pack.id}>
          <h3>{pack.packName}</h3>
          <p>{pack.authorName}</p>
          <p>KEY {pack.key}</p>
          <p>{pack.trackSoundName}</p>
          <div className="shared-tag-row">
            {pack.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <ol className="shared-chord-list">
            {pack.chords.map((chord) => <li key={chord.slotIndex}>{chord.displayName}</li>)}
          </ol>
          <time dateTime={pack.createdAt}>{new Date(pack.createdAt).toLocaleDateString()}</time>
          <button
            type="button"
            aria-label={`Load ${pack.packName} into editor`}
            onClick={() => onLoadPack(pack)}
          >
            Load into editor
          </button>
        </article>
      ))}
    </div>
    {appendState === "error" ? (
      <div className="shared-append-error" role="alert">
        <p>{appendError}</p>
        <button type="button" onClick={() => void loadMore()}>Try loading more</button>
      </div>
    ) : null}
    {nextCursor && appendState !== "error" ? (
      <button
        className="shared-load-more"
        type="button"
        disabled={appendState === "loading"}
        onClick={() => void loadMore()}
      >
        {appendState === "loading" ? "Loading more…" : "Load more"}
      </button>
    ) : null}
  </>
) : null}
```

Keep the `Refresh` button enabled during an initial request so a newer generation can supersede a slow request. `loadFirstPage` already replaces items only after success, clears append errors, and rejects stale generations.

- [ ] **Step 4: Run the component tests and verify GREEN**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackBrowser.test.tsx
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit pagination and concurrency behavior**

```bash
git add src/components/SharedPackBrowser.tsx src/components/SharedPackBrowser.test.tsx
git commit -m "feat: paginate and refresh shared packs"
```

---

### Task 4: App Navigation and Confirmed Editor Loading

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `SharedPackBrowser`, `PackRepository`, `createSupabasePackRepository(env)`, `sharedPackToChordPack`, and `editorReducer`'s existing `replacePack` action.
- Produces: `App({ packRepository? }: AppProps)`, lazy repository access, view navigation, and confirmed loading.

- [ ] **Step 1: Add failing App integration tests**

At the top of `src/App.test.tsx`, import `PackRepository` and `PublicPack`, then add these helpers near the existing mocks:

```tsx
import type { PackRepository } from "./sharing/packRepository";
import type { PublicPack } from "./sharing/types";

function sharedPack(name = "Shared Starter"): PublicPack {
  const pack = createDefaultPack();
  return {
    packName: name,
    authorName: "Ada",
    tags: ["shared"],
    key: "D",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 7,
    chords: pack.chords.map((chord) => ({ ...chord, notes: [...chord.notes] })),
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    reportedCount: 0
  };
}

function sharingRepository(pack: PublicPack): PackRepository {
  return {
    listPacks: vi.fn().mockResolvedValue({ items: [pack], nextCursor: null }),
    createPack: vi.fn(),
    updatePack: vi.fn(),
    deletePack: vi.fn(),
    reportPack: vi.fn(),
    getPack: vi.fn()
  };
}
```

Append these tests to the existing `describe("App", ...)` block:

```tsx
it("opens the shared view without discarding editor state", async () => {
  const repository = sharingRepository(sharedPack());
  renderApp(<App packRepository={repository} />);
  await userEvent.clear(screen.getByLabelText("Pack Name"));
  await userEvent.type(screen.getByLabelText("Pack Name"), "Unsaved Local Pack");

  await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
  expect(await screen.findByRole("heading", { name: "Shared Starter" })).toBeInTheDocument();
  expect(repository.listPacks).toHaveBeenCalledWith({ limit: 20 });

  await userEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByDisplayValue("Unsaved Local Pack")).toBeInTheDocument();
});

it("keeps the current editor when shared-pack confirmation is cancelled", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  renderApp(<App packRepository={sharingRepository(sharedPack())} />);
  await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
  await userEvent.click(await screen.findByRole("button", { name: "Load Shared Starter into editor" }));

  expect(window.confirm).toHaveBeenCalledWith(
    "Replace the current editor contents with “Shared Starter”?"
  );
  expect(screen.getByRole("heading", { name: "Shared Starter" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByDisplayValue("Starter Pack")).toBeInTheDocument();
});

it("loads a confirmed independent copy, resets slot and SCALE, and returns to editor", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  renderApp(<App packRepository={sharingRepository(sharedPack())} />);
  await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));

  await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
  await userEvent.click(await screen.findByRole("button", { name: "Load Shared Starter into editor" }));

  expect(screen.getByDisplayValue("Shared Starter")).toBeInTheDocument();
  expect(screen.getByText("Loaded “Shared Starter” from shared packs.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Slot 1 C" })).toHaveClass("selected");
  expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
});

it("contains missing sharing configuration and keeps the editor usable", async () => {
  renderApp(<App createPackRepository={() => {
    throw new Error("Supabase URL and anonymous key are required.");
  }} />);
  await userEvent.click(screen.getByRole("button", { name: "Shared Packs" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeEnabled();
});
```

- [ ] **Step 2: Run the App tests and verify RED**

Run:

```bash
npx vitest run --config vite.config.ts src/App.test.tsx
```

Expected: new tests FAIL because `App` has no repository props or view navigation.

- [ ] **Step 3: Add repository injection and navigation to App**

Add imports and public props in `src/App.tsx`:

```tsx
import { SharedPackBrowser } from "./components/SharedPackBrowser";
import type { PackRepository } from "./sharing/packRepository";
import { sharedPackToChordPack } from "./sharing/sharedPackToChordPack";
import { createSupabasePackRepository } from "./sharing/supabasePackRepository";
import type { PublicPack } from "./sharing/types";

export interface AppProps {
  packRepository?: PackRepository;
  createPackRepository?: () => PackRepository;
}

function createProductionPackRepository(): PackRepository {
  return createSupabasePackRepository(import.meta.env);
}

export default function App({
  packRepository,
  createPackRepository = createProductionPackRepository
}: AppProps = {}) {
```

Inside `App`, add stable lazy access and view state:

```tsx
const [activeView, setActiveView] = useState<"editor" | "shared-packs">("editor");
const repositoryRef = useRef<PackRepository | null>(packRepository ?? null);
const getPackRepository = useCallback(() => {
  repositoryRef.current ??= createPackRepository();
  return repositoryRef.current;
}, [createPackRepository]);

const handleLoadSharedPack = useCallback((pack: PublicPack) => {
  const confirmed = window.confirm(
    `Replace the current editor contents with “${pack.packName}”?`
  );
  if (!confirmed) return;
  setCurrentScale(null);
  dispatch({
    type: "replacePack",
    pack: sharedPackToChordPack(pack),
    message: `Loaded “${pack.packName}” from shared packs.`
  });
  setActiveView("editor");
}, []);
```

Replace the empty right side of `.top-bar` with this navigation:

```tsx
<nav className="view-switch" aria-label="Application view">
  <button
    type="button"
    aria-pressed={activeView === "editor"}
    onClick={() => setActiveView("editor")}
  >
    Editor
  </button>
  <button
    type="button"
    aria-pressed={activeView === "shared-packs"}
    onClick={() => setActiveView("shared-packs")}
  >
    Shared Packs
  </button>
</nav>
```

Wrap the existing editor `<section className="workspace" ...>` in `activeView === "editor" ? (...) : (...)` and render the alternate branch exactly as:

```tsx
<main className="shared-workspace">
  <SharedPackBrowser
    getRepository={getPackRepository}
    onLoadPack={handleLoadSharedPack}
  />
</main>
```

Do not disconnect MIDI or reset KEY when switching views. Only a confirmed shared load clears `currentScale`.

- [ ] **Step 4: Run App and full frontend tests and verify GREEN**

Run:

```bash
npx vitest run --config vite.config.ts src/App.test.tsx src/components/SharedPackBrowser.test.tsx src/sharing/sharedPackToChordPack.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit App integration**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: load shared packs into editor"
```

---

### Task 5: Responsive Shared-Pack Presentation

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/SharedPackBrowser.test.tsx`

**Interfaces:**
- Consumes: CSS class names rendered by `App` and `SharedPackBrowser`.
- Produces: clear active navigation, responsive card grid, visible states, and consistent buttons/tags.

- [ ] **Step 1: Add failing structural presentation assertions**

Add these assertions to the successful-card test in `src/components/SharedPackBrowser.test.tsx`:

```tsx
expect(screen.getByRole("heading", { name: "Newest Pack" }).closest("article"))
  .toHaveClass("shared-pack-card", "panel");
expect(screen.getByText("pop")).toHaveClass("shared-tag");
expect(screen.getByRole("button", { name: "Load Newest Pack into editor" }))
  .toHaveClass("shared-load-action");
```

Update the component markup to add `className="shared-tag"` to tag spans and `className="shared-load-action"` to each load action. Run the focused test before CSS to validate the stable styling hooks.

- [ ] **Step 2: Run the focused test and verify RED, then add class hooks**

Run:

```bash
npx vitest run --config vite.config.ts src/components/SharedPackBrowser.test.tsx
```

Expected before markup change: FAIL on missing classes. Expected after the two class additions: PASS.

- [ ] **Step 3: Add responsive styles**

Append these rules before the existing media queries in `src/styles.css`:

```css
.view-switch {
  display: flex;
  gap: 8px;
}

.view-switch button,
.shared-browser button {
  background: #ffffff;
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  color: #1b1c1f;
  cursor: pointer;
  min-height: 38px;
  padding: 7px 11px;
}

.view-switch button[aria-pressed="true"] {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #ffffff;
}

.shared-workspace {
  padding: 20px 24px 28px;
}

.shared-browser {
  display: grid;
  gap: 16px;
}

.shared-browser-header {
  align-items: start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.shared-browser-header h2,
.shared-browser-header p,
.shared-pack-card h3,
.shared-pack-card p {
  margin: 0;
}

.shared-browser-header > div,
.shared-pack-card {
  display: grid;
  gap: 8px;
}

.shared-pack-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
}

.shared-pack-card {
  padding: 16px;
}

.shared-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.shared-tag {
  background: #eef1f6;
  border-radius: 999px;
  color: #4b5565;
  font-size: 12px;
  padding: 4px 8px;
}

.shared-chord-list {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  padding-left: 22px;
}

.shared-pack-card time {
  color: #687080;
  font-size: 13px;
}

.shared-load-action {
  justify-self: start;
}

.shared-error,
.shared-append-error {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #991b1b;
  padding: 12px;
}

.shared-load-more {
  justify-self: center;
}

.shared-browser button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
```

Inside `@media (max-width: 820px)`, add:

```css
.shared-workspace {
  padding: 16px;
}
```

Inside `@media (max-width: 460px)`, add:

```css
.view-switch,
.view-switch button,
.shared-browser-header button {
  width: 100%;
}

.shared-browser-header {
  align-items: stretch;
  flex-direction: column;
}
```

- [ ] **Step 4: Run tests and production build**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest suites PASS; TypeScript and Vite production build exit 0 with generated `dist/` assets.

- [ ] **Step 5: Commit presentation**

```bash
git add src/styles.css src/components/SharedPackBrowser.tsx src/components/SharedPackBrowser.test.tsx
git commit -m "style: add responsive shared pack browser"
```

---

### Task 6: Final Regression and Scope Audit

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–5.
- Produces: verified feature with no out-of-scope sharing mutations.

- [ ] **Step 1: Verify all automated suites**

Run:

```bash
npm test
npm run test:deployment
npm run test:server
npm run build
```

Expected: every command exits 0; all tests PASS; production build succeeds.

- [ ] **Step 2: Audit the browser bundle boundary and scope**

Run:

```bash
rg -n "createPack|updatePack|deletePack|reportPack" src/components/SharedPackBrowser.tsx src/App.tsx
rg -n "VITE_SUPABASE_SERVICE|service.role|service_role" src
git diff --check master~5..HEAD
git status --short
```

Expected:

- No mutation repository methods appear in the new UI.
- No service-role secret name appears in `src`.
- `git diff --check` prints nothing.
- `git status --short` prints nothing after all planned commits.

- [ ] **Step 3: Review the implementation against the accepted design**

Confirm all of the following from tests and code:

```text
[x] Editor / Shared Packs navigation preserves App state
[x] First page uses limit 20
[x] Cursor pages append and remain retryable
[x] Refresh replaces and stale completions cannot overwrite it
[x] Every load asks for confirmation
[x] Loaded data is a deep-cloned independent local pack
[x] Confirmed load resets slot to 1 and invalidates SCALE
[x] Live SEQTRAK KEY is not changed by loading
[x] Sharing errors stay inside the shared view
[x] Publishing, mutation, report, filter, and ranking UI are absent
```

- [ ] **Step 4: Commit only if the audit required a correction**

If a correction was necessary, stage only the affected feature files and commit:

```bash
git add src/App.tsx src/App.test.tsx src/components/SharedPackBrowser.tsx src/components/SharedPackBrowser.test.tsx src/sharing/sharedPackToChordPack.ts src/sharing/sharedPackToChordPack.test.ts src/styles.css
git commit -m "fix: complete shared pack browser verification"
```

If no correction was necessary, do not create an empty commit.
