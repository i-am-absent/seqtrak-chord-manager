# MIDI Port Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically connect through SEQTRAK-prefixed Web MIDI ports while exposing independent input and output selectors for manual recovery and override.

**Architecture:** Pure selection helpers preserve a valid selected port ID or choose the first case-insensitive `SEQTRAK` prefix match. React owns selected input/output IDs and connection lifecycle; `DevicePanel` renders controlled selectors without deciding preference or constructing MIDI clients.

**Tech Stack:** TypeScript 5, React 19, Web MIDI SysEx, Vitest 4, Testing Library

## Global Constraints

- Input and output selections are independent and keyed by Web MIDI port ID, never by visible name.
- A valid manual selection always takes precedence over automatic selection.
- Automatic selection chooses the first port whose name begins with `SEQTRAK`, ignoring letter case.
- An arbitrary first port is never used as a fallback.
- If either direction is unresolved, no `SeqtrakClient` is created and no SysEx is sent.
- Changing either selector disconnects without automatically reconnecting and resets KEY to `0` and SCALE to unknown.
- Selected port IDs are transient page-session state and are not added to `ChordPack`.
- Existing connection-generation guards must continue to reject stale access, KEY, read, and write completions.
- The existing untracked file `docs/manual-tests/.seqtrak-phase-2.md.swp` belongs to the user and must not be staged, modified, or deleted.

---

## File Structure

- `src/midi/midiTypes.ts`: allow browser MIDI port names to be null.
- `src/midi/midiAccessService.ts`: pure selection and display-label helpers plus existing access/state forwarding.
- `src/midi/midiAccessService.test.ts`: preferred-port, stale-ID, duplicate-name, and unnamed-port tests.
- `src/components/DevicePanel.tsx`: controlled input/output selectors.
- `src/components/DevicePanel.test.tsx`: selector rendering, ID callbacks, duplicate names, and busy state.
- `src/App.tsx`: selection state, auto-selection, exact port resolution, manual disconnect, disappeared-port clearing, and diagnostic errors.
- `src/App.test.tsx`: automatic/manual connection and lifecycle integration.
- `src/styles.css`: compact selector layout consistent with the existing device panel.
- `docs/manual-tests/seqtrak-phase-2.md`: Windows loopback/SEQTRAK selection verification.

---

### Task 1: Preferred MIDI Port Selection Policy

**Files:**
- Modify: `src/midi/midiTypes.ts`
- Modify: `src/midi/midiAccessService.ts`
- Modify: `src/midi/midiAccessService.test.ts`

**Interfaces:**
- Consumes: arrays of `{ id: string; name: string | null }` and a selected ID or `null`.
- Produces: `resolveMidiPortId<T extends MidiPortIdentity>(ports: readonly T[], selectedId: string | null): string | null` and `midiPortLabel(port, direction): string`.

- [ ] **Step 1: Write failing pure selection tests**

Add these tests to `src/midi/midiAccessService.test.ts`:

```ts
import { midiPortLabel, resolveMidiPortId } from "./midiAccessService";

it("prefers the first SEQTRAK-prefixed port over earlier loopbacks", () => {
  const ports = [
    { id: "loop-a", name: "Default App Loopback (A)" },
    { id: "loop-b", name: "Default App Loopback (B)" },
    { id: "seqtrak-1", name: "SEQTRAK-1" }
  ];
  expect(resolveMidiPortId(ports, null)).toBe("seqtrak-1");
});

it("matches the SEQTRAK prefix without case sensitivity", () => {
  expect(resolveMidiPortId([{ id: "device", name: "seqtrak-2" }], null)).toBe("device");
});

it("preserves a valid manual choice and replaces a stale choice", () => {
  const ports = [
    { id: "manual", name: "Custom MIDI" },
    { id: "auto", name: "SEQTRAK-1" }
  ];
  expect(resolveMidiPortId(ports, "manual")).toBe("manual");
  expect(resolveMidiPortId(ports, "missing")).toBe("auto");
});

it("does not fall back to the first arbitrary or unnamed port", () => {
  expect(resolveMidiPortId([
    { id: "loop", name: "Loopback" },
    { id: "unnamed", name: null }
  ], null)).toBeNull();
});

it("uses IDs to distinguish duplicate names and labels unnamed ports", () => {
  const ports = [
    { id: "same-1", name: "SEQTRAK-1" },
    { id: "same-2", name: "SEQTRAK-1" }
  ];
  expect(resolveMidiPortId(ports, "same-2")).toBe("same-2");
  expect(midiPortLabel({ id: "x", name: null }, "input")).toBe("Unnamed MIDI input");
  expect(midiPortLabel({ id: "x", name: null }, "output")).toBe("Unnamed MIDI output");
});
```

- [ ] **Step 2: Run the selection tests and verify RED**

Run: `npm test -- --run src/midi/midiAccessService.test.ts`

Expected: FAIL because `resolveMidiPortId` and `midiPortLabel` are not exported and MIDI names do not accept `null`.

- [ ] **Step 3: Implement the port identity policy**

Change both `name` properties in `src/midi/midiTypes.ts` to `name: string | null`.

Add to `src/midi/midiAccessService.ts`:

```ts
export interface MidiPortIdentity {
  id: string;
  name: string | null;
}

export function resolveMidiPortId<T extends MidiPortIdentity>(
  ports: readonly T[],
  selectedId: string | null
): string | null {
  if (selectedId && ports.some((port) => port.id === selectedId)) {
    return selectedId;
  }
  return ports.find((port) => port.name?.toUpperCase().startsWith("SEQTRAK"))?.id ?? null;
}

export function midiPortLabel(
  port: MidiPortIdentity,
  direction: "input" | "output"
): string {
  return port.name || `Unnamed MIDI ${direction}`;
}
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm test -- --run src/midi/midiAccessService.test.ts
npm test -- --run
```

Expected: preferred-port tests pass and the existing suite remains green after updating any strictly typed test fixtures to accept `string | null`.

- [ ] **Step 5: Commit the selection policy**

```bash
git add src/midi/midiTypes.ts src/midi/midiAccessService.ts src/midi/midiAccessService.test.ts
git commit -m "feat: select preferred SEQTRAK MIDI ports"
```

---

### Task 2: Controlled Input and Output Selectors

**Files:**
- Modify: `src/components/DevicePanel.tsx`
- Modify: `src/components/DevicePanel.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `selectedInputId: string`, `selectedOutputId: string`, `onInputChange(id: string): void`, and `onOutputChange(id: string): void`.
- Produces: two labeled controlled selectors whose option values are port IDs.

- [ ] **Step 1: Write failing selector component tests**

Extend the common props in `DevicePanel.test.tsx` with selected IDs and callbacks. Add:

```ts
it("renders independent MIDI port selectors and reports selected IDs", async () => {
  const onInputChange = vi.fn();
  const onOutputChange = vi.fn();
  renderApp(
    <DevicePanel
      status="disconnected"
      inputs={[
        { ...midiInput("Duplicate"), id: "input-a" },
        { ...midiInput("Duplicate"), id: "input-b" }
      ]}
      outputs={[{ ...midiOutput("SEQTRAK-1"), id: "output-a" }]}
      selectedInputId="input-b"
      selectedOutputId="output-a"
      selectedTrackIndex={7}
      currentScale={null}
      canWrite={false}
      onConnect={vi.fn()}
      onRead={vi.fn()}
      onWrite={vi.fn()}
      onInputChange={onInputChange}
      onOutputChange={onOutputChange}
      onTrackChange={vi.fn()}
    />
  );

  expect(screen.getByLabelText("Input Port")).toHaveValue("input-b");
  expect(screen.getByLabelText("Output Port")).toHaveValue("output-a");
  expect(screen.getAllByRole("option", { name: "Duplicate" })).toHaveLength(2);
  await userEvent.selectOptions(screen.getByLabelText("Input Port"), "input-a");
  expect(onInputChange).toHaveBeenCalledWith("input-a");
  await userEvent.selectOptions(screen.getByLabelText("Output Port"), "");
  expect(onOutputChange).toHaveBeenCalledWith("");
});
```

Also extend the busy-state test to assert both new selectors are disabled while `status="busy"` and enabled for `status="error"`.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- --run src/components/DevicePanel.test.tsx`

Expected: FAIL because the new props and selectors do not exist.

- [ ] **Step 3: Add controlled selectors**

Add the four props to `DevicePanelProps` and render before the target-track selector:

```tsx
<label className="device-port-select">
  Input Port
  <select
    value={selectedInputId}
    disabled={isBusy}
    onChange={(event) => onInputChange(event.target.value)}
  >
    <option value="">Select MIDI input</option>
    {inputs.map((port) => (
      <option key={port.id} value={port.id}>
        {midiPortLabel(port, "input")}
      </option>
    ))}
  </select>
</label>
<label className="device-port-select">
  Output Port
  <select
    value={selectedOutputId}
    disabled={isBusy}
    onChange={(event) => onOutputChange(event.target.value)}
  >
    <option value="">Select MIDI output</option>
    {outputs.map((port) => (
      <option key={port.id} value={port.id}>
        {midiPortLabel(port, "output")}
      </option>
    ))}
  </select>
</label>
```

Pass temporary empty IDs and no-op callbacks from `App.tsx` so this task compiles; Task 3 replaces that bridge with live state. Add `.device-port-select` to the existing label/select layout rules in `src/styles.css` without changing keyboard geometry.

- [ ] **Step 4: Run component tests and build**

Run:

```bash
npm test -- --run src/components/DevicePanel.test.tsx
npm run build
```

Expected: selector tests pass, duplicate labels remain separate options by ID, and TypeScript/Vite build succeeds.

- [ ] **Step 5: Commit the selector UI**

```bash
git add src/components/DevicePanel.tsx src/components/DevicePanel.test.tsx src/styles.css src/App.tsx
git commit -m "feat: add MIDI port selectors"
```

---

### Task 3: Automatic and Manual Port Connection Lifecycle

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `resolveMidiPortId`, `midiPortLabel`, refreshed MIDI lists, and selector ID callbacks.
- Produces: automatic SEQTRAK selection, manual override preservation, exact-pair connection, and selection-aware disconnect/error behavior.

- [ ] **Step 1: Preserve real selection helpers in the App module mock**

Change the `midiAccessService` mock in `App.test.tsx` so App exercises the production pure helpers:

```ts
vi.mock("./midi/midiAccessService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./midi/midiAccessService")>();
  return {
    ...actual,
    createMidiAccessService: midiMocks.createMidiAccessService
  };
});
```

- [ ] **Step 2: Write failing automatic-selection tests**

Use access fixtures ordered as Loopback A, Loopback B, then SEQTRAK-1 for both directions. Assert after one Connect click:

```ts
expect(screen.getByLabelText("Input Port")).toHaveValue("seqtrak-input");
expect(screen.getByLabelText("Output Port")).toHaveValue("seqtrak-output");
expect(midiMocks.seqtrakClientConstructor).toHaveBeenCalledWith(
  expect.objectContaining({ id: "seqtrak-input" }),
  expect.objectContaining({ id: "seqtrak-output" })
);
```

Add a no-match fixture and assert status is disconnected, the message is exactly `Select MIDI input and output ports, then connect again.`, and the client constructor was not called.

- [ ] **Step 3: Write failing manual-selection lifecycle tests**

Add tests that:

1. connect automatically;
2. change Input Port to a loopback ID;
3. assert client disposal, both unsubscribe callbacks, KEY-0 keyboard mapping, SCALE unknown, disconnected status, and `MIDI port selection changed. Connect again.`;
4. select a manual output independently;
5. click Connect again and assert the exact two manually selected objects reach the constructor even though SEQTRAK-prefixed candidates exist.

Add state-change tests proving selected input disappearance clears only Input Port, selected output disappearance clears only Output Port, and an unrelated disconnected port changes neither selector nor status.

Add a rejected initial KEY test asserting the message contains both selected labels followed by the underlying timeout, for example:

```text
MIDI connection failed (Input: SEQTRAK-1; Output: SEQTRAK-1): Timed out waiting for SEQTRAK response.
```

- [ ] **Step 4: Run App tests and verify RED**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because App still uses index zero and has no selected-ID state or selector lifecycle.

- [ ] **Step 5: Implement selection-aware connection**

In `App.tsx`, add selected ID state initialized to empty strings. In `handleConnect`, after access resolves:

```ts
const inputId = resolveMidiPortId(access.inputs, selectedInputId || null);
const outputId = resolveMidiPortId(access.outputs, selectedOutputId || null);
setSelectedInputId(inputId ?? "");
setSelectedOutputId(outputId ?? "");

if (!inputId || !outputId) {
  setDeviceStatus("disconnected");
  dispatch({
    type: "setMessage",
    message: "Select MIDI input and output ports, then connect again."
  });
  return;
}

const input = access.inputs.find((port) => port.id === inputId);
const output = access.outputs.find((port) => port.id === outputId);
if (!input || !output) {
  setDeviceStatus("disconnected");
  dispatch({
    type: "setMessage",
    message: "Select MIDI input and output ports, then connect again."
  });
  return;
}
```

Store the concrete pair in local variables visible to the `catch`. When both exist, format client errors as:

```ts
`MIDI connection failed (Input: ${midiPortLabel(input, "input")}; Output: ${midiPortLabel(output, "output")}): ${detail}`
```

Do not wrap Web MIDI unsupported/permission errors that occur before a concrete pair is resolved.

Add a shared manual-change callback that calls `releaseClient`, clears SCALE, sets disconnected status, and dispatches `MIDI port selection changed. Connect again.` after updating only the chosen direction.

In the selected-port `statechange` handler, clear only the ID whose concrete selected port disconnected, then perform the existing release/reset. Keep unrelated event behavior unchanged.

Pass live IDs and callbacks to `DevicePanel`. Add both selected IDs to the `handleConnect` dependency list so reconnect uses the latest manual choices.

- [ ] **Step 6: Run focused and full regression suites**

Run:

```bash
npm test -- --run src/App.test.tsx src/components/DevicePanel.test.tsx src/midi/midiAccessService.test.ts
npm test -- --run
npm run build
git diff --check
```

Expected: all selection tests and the existing stale-access, stale-KEY, stale-read/write, disconnect, KEY, and preview tests pass; build succeeds; diff check is empty.

- [ ] **Step 7: Commit the connection lifecycle**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "fix: connect through selected MIDI ports"
```

---

### Task 4: Manual Verification and Final Checks

**Files:**
- Modify: `docs/manual-tests/seqtrak-phase-2.md`

**Interfaces:**
- Consumes: completed automatic/manual selection behavior.
- Produces: repeatable Windows verification with Loopback and SEQTRAK ports present.

- [ ] **Step 1: Add the manual port-selection sequence**

Append a `MIDI port selection` section with these checks:

1. With `Default App Loopback (A)`, `Default App Loopback (B)`, and `SEQTRAK-1` visible in both directions, click Connect once and verify both selectors choose `SEQTRAK-1` and status becomes connected.
2. Select Loopback A for input and verify the app disconnects, KEY returns to 0, SCALE becomes unknown, and the reconnect instruction appears.
3. Select Loopback B for output, click Connect, and verify an expected timeout names both chosen ports.
4. Restore `SEQTRAK-1` for both directions, reconnect, and verify KEY and Read from SEQTRAK work.
5. Disconnect the selected input, reconnect it, and verify only the missing direction is cleared/reselected.

- [ ] **Step 2: Run final verification**

Run:

```bash
npm test -- --run
npm run test:server
npm run build
git diff --check
git status --short
```

Expected: all unit and server tests pass, the production build succeeds, diff check is empty, and status contains only the intended manual-test documentation plus the user's untouched `.swp` file.

- [ ] **Step 3: Commit the manual guide without staging the swap file**

```bash
git add docs/manual-tests/seqtrak-phase-2.md
git commit -m "docs: add MIDI port selection checks"
```

