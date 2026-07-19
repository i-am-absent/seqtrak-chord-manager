# Editor Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation-protected Editor Reset that restores the default pack, slot 1, and unknown SCALE while preserving MIDI, port, track, KEY, and publication-fingerprint state.

**Architecture:** `App` owns Reset availability and state transitions because it owns every affected state. A focused native-dialog component owns modal behavior and focus. Reset reuses the reducer's validated `replacePack` action and compares deterministic editable-pack fingerprints rather than object identity.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, CSS

## Global Constraints

- Reset changes only the pack, selected slot, SCALE, visible publication notice, and Editor status message.
- Reset preserves the MIDI client, connection status, selected ports, target track, live SEQTRAK KEY, and `lastPublishedFingerprint`.
- The confirmation copy is exactly `Reset editor?` and `This replaces the current pack with the default pack and clears SCALE. Your MIDI connection and SEQTRAK KEY will be preserved.`
- Confirmation actions are exactly `Cancel` and `Reset editor`.
- Completion status is exactly `Editor reset to the default pack.`
- Reset is disabled at the complete reset target and while publication is submitting.
- No new runtime dependency is allowed.
- Implementation must use test-driven development and preserve all existing behavior.

---

## File Structure

- Create `src/components/ResetEditorDialog.tsx`: native modal, accessible copy, cancellation, and focus restoration.
- Create `src/components/ResetEditorDialog.test.tsx`: dialog contract and interaction tests.
- Modify `src/App.tsx`: availability calculation, Reset state, handlers, header action, and dialog integration.
- Modify `src/App.test.tsx`: reset state and cross-feature invariants.
- Modify `src/styles.css`: Reset trigger, danger confirmation, and narrow-width layout.

### Task 1: Reset Editor Confirmation Dialog

**Files:**
- Create: `src/components/ResetEditorDialog.tsx`
- Create: `src/components/ResetEditorDialog.test.tsx`

**Interfaces:**
- Consumes: `RefObject<HTMLButtonElement | null>` from React.
- Produces: `ResetEditorDialog(props: ResetEditorDialogProps)` where `trigger`, `onCancel`, and `onConfirm` are required.

- [ ] **Step 1: Write the failing dialog tests**

Create `src/components/ResetEditorDialog.test.tsx` with this behavior:

```tsx
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ResetEditorDialog } from "./ResetEditorDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() { this.setAttribute("open", ""); }
  });
});

function setup() {
  const trigger = createRef<HTMLButtonElement>();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = render(<>
    <button ref={trigger}>Reset trigger</button>
    <ResetEditorDialog trigger={trigger} onCancel={onCancel} onConfirm={onConfirm} />
  </>);
  return { ...view, trigger, onCancel, onConfirm };
}

it("opens a labelled modal, explains preserved device state, and focuses the heading", () => {
  setup();
  expect(screen.getByRole("dialog", { name: "Reset editor?" })).toHaveAttribute("open");
  expect(screen.getByRole("heading", { name: "Reset editor?" })).toHaveFocus();
  expect(screen.getByText(
    "This replaces the current pack with the default pack and clears SCALE. Your MIDI connection and SEQTRAK KEY will be preserved."
  )).toBeInTheDocument();
});

it("cancels from the button, Escape, and backdrop", async () => {
  const button = setup();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(button.onCancel).toHaveBeenCalledTimes(1);
  button.unmount();
  const escape = setup();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(escape.onCancel).toHaveBeenCalledTimes(1);
  escape.unmount();
  const backdrop = setup();
  fireEvent.click(screen.getByRole("dialog"));
  expect(backdrop.onCancel).toHaveBeenCalledTimes(1);
});

it("confirms only from Reset editor", async () => {
  const { onConfirm, onCancel } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Reset editor" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

it("restores focus to a connected trigger on unmount", () => {
  const view = setup();
  view.rerender(<button ref={view.trigger}>Reset trigger</button>);
  expect(view.trigger.current).toHaveFocus();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/components/ResetEditorDialog.test.tsx
```

Expected: FAIL because `./ResetEditorDialog` does not exist.

- [ ] **Step 3: Implement the minimal native dialog**

Create `src/components/ResetEditorDialog.tsx`:

```tsx
import { useEffect, useRef, type RefObject } from "react";

export interface ResetEditorDialogProps {
  trigger: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetEditorDialog({ trigger, onCancel, onConfirm }: ResetEditorDialogProps) {
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
      className="reset-dialog"
      ref={dialogRef}
      aria-labelledby="reset-dialog-title"
      aria-describedby="reset-dialog-description"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div className="reset-dialog-card">
        <h2 id="reset-dialog-title" ref={headingRef} tabIndex={-1}>Reset editor?</h2>
        <p id="reset-dialog-description">
          This replaces the current pack with the default pack and clears SCALE. Your MIDI connection and SEQTRAK KEY will be preserved.
        </p>
        <div className="reset-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="danger-action" type="button" onClick={onConfirm}>Reset editor</button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `npm test -- src/components/ResetEditorDialog.test.tsx`.

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the dialog**

```bash
git add src/components/ResetEditorDialog.tsx src/components/ResetEditorDialog.test.tsx
git commit -m "feat: add editor reset confirmation"
```

### Task 2: App Reset State and Invariants

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `ResetEditorDialog`, `createDefaultPack`, `toEditablePack`, `editablePackFingerprint`, and reducer action `replacePack`.
- Produces: Reset button state, modal lifecycle, and confirmed reset behavior in `App`.

- [ ] **Step 1: Add failing App tests for availability and cancellation**

Append tests inside the existing `describe("App")`:

```tsx
it("enables Reset only after a resettable Editor value changes and cancel preserves it", async () => {
  renderApp(<App />);
  const reset = screen.getByRole("button", { name: "Reset" });
  expect(reset).toBeDisabled();
  await userEvent.clear(screen.getByLabelText("Pack name"));
  await userEvent.type(screen.getByLabelText("Pack name"), "Changed");
  expect(reset).toBeEnabled();
  await userEvent.click(reset);
  expect(screen.getByRole("dialog", { name: "Reset editor?" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByDisplayValue("Changed")).toBeInTheDocument();
  expect(reset).toHaveFocus();
});

it("also enables Reset for a non-default slot or known SCALE", async () => {
  renderApp(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
  expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
});
```

Run `npm test -- src/App.test.tsx`.

Expected: FAIL because no Reset action exists.

- [ ] **Step 2: Add failing App tests for confirmation and preservation**

Add:

```tsx
it("resets pack, slot, and SCALE while preserving MIDI, ports, track, and live KEY", async () => {
  renderApp(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText("Target track"), "8");
  await userEvent.click(screen.getByRole("button", { name: "Read from SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Current SCALE: 2")).toBeInTheDocument());
  act(() => midiMocks.keyCallback?.(3));
  await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));

  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  await userEvent.click(screen.getByRole("button", { name: "Reset editor" }));

  expect(screen.getByDisplayValue("Untitled Pack")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Slot 1 C" })).toHaveClass("selected");
  expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
  expect(screen.getByText("Status: connected")).toBeInTheDocument();
  expect(screen.getByLabelText("Input Port")).toHaveValue("input-1");
  expect(screen.getByLabelText("Output Port")).toHaveValue("output-1");
  expect(screen.getByLabelText("Target track")).toHaveValue("8");
  expect(screen.getByRole("button", { name: "D#4" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Editor reset to the default pack.")).toBeInTheDocument();
  expect(midiMocks.mockClient.dispose).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
});
```

Run `npm test -- src/App.test.tsx`.

Expected: FAIL at the missing Reset button.

- [ ] **Step 3: Add failing publication interaction tests**

Add:

```tsx
it("preserves the last-published fingerprint when Reset restores identical content", async () => {
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockImplementation(async (pack) => createdPublicPack(pack));
  renderApp(<App packRepository={repository} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  await screen.findByText("Published “Untitled Pack” to Shared Packs.");
  await userEvent.clear(screen.getByLabelText("Pack name"));
  await userEvent.type(screen.getByLabelText("Pack name"), "Changed");
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  await userEvent.click(screen.getByRole("button", { name: "Reset editor" }));
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(screen.queryByText(/Published “Untitled Pack”/)).not.toBeInTheDocument();
});

it("disables Reset while publication is submitting", async () => {
  const pending = deferred<PublicPack>();
  const repository = sharingRepository(sharedPack());
  vi.mocked(repository.createPack).mockReturnValue(pending.promise);
  renderApp(<App packRepository={repository} />);
  await userEvent.clear(screen.getByLabelText("Pack name"));
  await userEvent.type(screen.getByLabelText("Pack name"), "Changed");
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  await userEvent.click(screen.getByRole("button", { name: "Publish shared pack" }));
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  await act(async () => pending.resolve(createdPublicPack(
    vi.mocked(repository.createPack).mock.calls[0][0]
  )));
});
```

Run `npm test -- src/App.test.tsx`.

Expected: FAIL because Reset state and publication interaction are absent.

- [ ] **Step 4: Implement availability, handlers, and rendering**

In `src/App.tsx`:

```tsx
import { ResetEditorDialog } from "./components/ResetEditorDialog";
```

Add stable default values outside `App`:

```tsx
const defaultEditableFingerprint = editablePackFingerprint(toEditablePack(createDefaultPack()));
```

Add state and trigger near the publication state:

```tsx
const [resetDialogOpen, setResetDialogOpen] = useState(false);
const resetTriggerRef = useRef<HTMLButtonElement>(null);
```

After `currentPublicationFingerprint`, calculate:

```tsx
const resetAvailable =
  currentPublicationFingerprint !== defaultEditableFingerprint ||
  state.selectedSlotIndex !== 1 ||
  currentScale !== null;
```

Add handlers:

```tsx
const handleConfirmReset = useCallback(() => {
  setCurrentScale(null);
  setPublicationNotice(null);
  dispatch({
    type: "replacePack",
    pack: createDefaultPack(),
    message: "Editor reset to the default pack."
  });
  setResetDialogOpen(false);
}, []);
```

Render Reset in the Editor-only top action group. It must remain mounted behind the modal so focus can return:

```tsx
<button
  className="reset-trigger"
  type="button"
  ref={resetTriggerRef}
  disabled={!resetAvailable || publicationSubmitting}
  onClick={() => setResetDialogOpen(true)}
>
  Reset
</button>
```

Render the dialog after the main view:

```tsx
{resetDialogOpen ? (
  <ResetEditorDialog
    trigger={resetTriggerRef}
    onCancel={() => setResetDialogOpen(false)}
    onConfirm={handleConfirmReset}
  />
) : null}
```

- [ ] **Step 5: Run focused and related tests**

Run:

```bash
npm test -- src/components/ResetEditorDialog.test.tsx src/App.test.tsx src/domain/packEditor.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit App integration**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: reset editor without disconnecting SEQTRAK"
```

### Task 3: Reset Styling and Release Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/ResetEditorDialog.test.tsx`

**Interfaces:**
- Consumes: `.reset-trigger`, `.reset-dialog`, `.reset-dialog-card`, `.reset-dialog-actions`, and `.danger-action` class hooks.
- Produces: viewport-bounded, responsive, visibly destructive Reset UI.

- [ ] **Step 1: Add failing CSS hook assertions**

Add to the first dialog test:

```tsx
expect(screen.getByRole("dialog")).toHaveClass("reset-dialog");
expect(screen.getByRole("heading", { name: "Reset editor?" }).parentElement)
  .toHaveClass("reset-dialog-card");
expect(screen.getByRole("button", { name: "Reset editor" })).toHaveClass("danger-action");
```

Run `npm test -- src/components/ResetEditorDialog.test.tsx`.

Expected: PASS for component hooks. Then inspect `src/styles.css` with `rg -n "reset-dialog|reset-trigger|danger-action" src/styles.css`; expected no matching style rules.

- [ ] **Step 2: Add scoped responsive styles**

Add rules using the existing color variables and publication-dialog geometry:

```css
.reset-trigger {
  background: #ffffff;
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  color: #1b1c1f;
  cursor: pointer;
  min-height: 2.75rem;
  padding: 7px 11px;
}

.reset-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.reset-dialog button {
  background: #ffffff;
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  color: #1b1c1f;
  cursor: pointer;
  min-height: 38px;
  padding: 7px 11px;
}

.reset-dialog {
  width: min(34rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  padding: 0;
  border: 0;
  background: transparent;
}

.reset-dialog::backdrop {
  background: rgb(2 8 23 / 72%);
}

.reset-dialog-card {
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.5rem;
  border: 1px solid #cfd6e2;
  border-radius: 1rem;
  background: #ffffff;
  color: #1b1c1f;
}

.reset-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.reset-dialog .danger-action {
  border-color: #ef4444;
  background: #7f1d1d;
  color: #ffffff;
}

@media (max-width: 460px) {
  .reset-trigger,
  .reset-dialog-actions button {
    width: 100%;
  }
  .reset-dialog-actions {
    flex-direction: column;
  }
}
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test -- --maxWorkers=1
npm run test:deployment
npm run test:server
npm run build
git diff --check
```

Expected: frontend, deployment, server, and build all PASS; diff check is silent.

- [ ] **Step 4: Audit Reset scope**

Run:

```bash
rg -n "releaseClient|setSelectedInputId|setSelectedOutputId|setSelectedTrackIndex|setSeqtrakKeyOffset" src/App.tsx
```

Confirm `handleConfirmReset` calls none of those operations and does not change `lastPublishedFingerprint`.

- [ ] **Step 5: Commit styling**

```bash
git add src/styles.css src/components/ResetEditorDialog.test.tsx
git commit -m "style: add responsive editor reset confirmation"
```
