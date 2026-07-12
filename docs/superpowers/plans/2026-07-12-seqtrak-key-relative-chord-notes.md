# SEQTRAK KEY-Relative Chord Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store chord notes in SEQTRAK-relative form, derive keyboard and preview pitches from the live global KEY parameter, and provide reusable address-based Parameter Change subscriptions.

**Architecture:** The domain layer owns the configurable relative-note range and pure relative/absolute conversions. `SeqtrakClient` owns one MIDI listener that dispatches decoded Parameter Changes to request waiters and persistent address subscribers; React keeps the live KEY as transient connection state and converts only at presentation/edit boundaries.

**Tech Stack:** TypeScript 5, React 19, Web MIDI SysEx, Vitest 4, Testing Library

## Global Constraints

- SEQTRAK `KEY` is read-only and lives at SysEx address `30 40 7F`.
- Valid KEY values are integers from `0` through `11`.
- `ChordSlot.notes` always contains SEQTRAK-relative notes; `0x00` remains an empty wire value and is never a stored note.
- The initial configurable relative-note range is `0x24` through `0x60`.
- `ChordPack` must not persist the connected device KEY.
- Disconnected/browser-only operation always uses KEY offset `0`.
- Existing `ChordPack.key` remains recommendation metadata and is independent of SEQTRAK `KEY`.
- Every behavior change is implemented test-first.

---

## File Structure

- `src/domain/music.ts`: relative-note limits, KEY validation, pure conversion helpers, and pack validation.
- `src/domain/music.test.ts`: conversion, range, and relative pack validation.
- `src/domain/packEditor.ts`: absolute keyboard/recommendation actions converted to stored relative notes.
- `src/domain/packEditor.test.ts`: editing behavior under non-zero KEY.
- `src/midi/seqtrakSysex.ts`: KEY address and raw chord wire-value validation.
- `src/midi/seqtrakSysex.test.ts`: KEY address and empty/non-empty wire fixtures.
- `src/midi/parameterChangeReceiver.ts`: one listener, address dispatch, request waiters, subscriptions, and disposal.
- `src/midi/parameterChangeReceiver.test.ts`: multi-address, multi-subscriber, unsubscribe, timeout, and disposal tests.
- `src/midi/seqtrakClient.ts`: KEY requests, receiver ownership, subscriptions, and pre-operation KEY checks.
- `src/midi/seqtrakClient.test.ts`: client integration and unchanged relative read/write behavior.
- `src/midi/deviceWorkflow.ts`: propagate the KEY confirmed by reads/writes to the UI workflow.
- `src/midi/deviceWorkflow.test.ts`: KEY-aware read/write workflow contracts.
- `src/midi/midiAccessService.ts`: expose Web MIDI port-state subscription for disconnect cleanup.
- `src/midi/midiAccessService.test.ts`: subscribe/unsubscribe forwarding for device state changes.
- `src/midi/midiTypes.ts`: minimal MIDI port state-change event types.
- `src/components/Keyboard88.tsx`: derived absolute active notes and disabled range.
- `src/components/Keyboard88.test.tsx`: KEY mapping and disabled-key interaction.
- `src/components/ChordGrid.tsx`: absolute pitch-name display derived from relative notes.
- `src/components/ChordGrid.test.tsx`: pitch names re-render after KEY changes.
- `src/App.tsx`: transient KEY lifecycle, subscription cleanup, and preview conversions.
- `src/App.test.tsx`: connection, notifications, editing, preview, write, and reset behavior.
- `src/styles.css`: disabled piano-key presentation.

---

### Task 1: Relative Note Domain Policy

**Files:**
- Modify: `src/domain/music.ts`
- Modify: `src/domain/music.test.ts`

**Interfaces:**
- Consumes: integer relative note or absolute MIDI note plus KEY offset.
- Produces: `SEQTRAK_MIN_CHORD_NOTE`, `SEQTRAK_MAX_CHORD_NOTE`, `assertSeqtrakKeyOffset(value): void`, `relativeToAbsoluteNote(note, keyOffset): number`, `absoluteToRelativeNote(note, keyOffset): number`, and `isAbsoluteNoteSelectable(note, keyOffset): boolean`.

- [ ] **Step 1: Add failing conversion and validation tests**

Add imports and these cases to `src/domain/music.test.ts`:

```ts
import {
  absoluteToRelativeNote,
  assertSeqtrakKeyOffset,
  isAbsoluteNoteSelectable,
  relativeToAbsoluteNote,
  SEQTRAK_MAX_CHORD_NOTE,
  SEQTRAK_MIN_CHORD_NOTE
} from "./music";

it.each([0, 1, 11])("converts every relative note with KEY %i", (keyOffset) => {
  expect(relativeToAbsoluteNote(0x24, keyOffset)).toBe(0x24 + keyOffset);
  expect(relativeToAbsoluteNote(0x3c, keyOffset)).toBe(0x3c + keyOffset);
  expect(relativeToAbsoluteNote(0x60, keyOffset)).toBe(0x60 + keyOffset);
  expect(absoluteToRelativeNote(0x3c + keyOffset, keyOffset)).toBe(0x3c);
});

it("validates KEY and the derived selectable range", () => {
  expect(() => assertSeqtrakKeyOffset(0)).not.toThrow();
  expect(() => assertSeqtrakKeyOffset(11)).not.toThrow();
  expect(() => assertSeqtrakKeyOffset(12)).toThrow("SEQTRAK KEY must be an integer from 0 to 11.");
  expect(isAbsoluteNoteSelectable(SEQTRAK_MIN_CHORD_NOTE + 11, 11)).toBe(true);
  expect(isAbsoluteNoteSelectable(SEQTRAK_MAX_CHORD_NOTE + 11, 11)).toBe(true);
  expect(isAbsoluteNoteSelectable(SEQTRAK_MIN_CHORD_NOTE + 10, 11)).toBe(false);
});

it("validates stored notes against the configurable SEQTRAK-relative range", () => {
  expect(validateChordNotes([SEQTRAK_MIN_CHORD_NOTE, SEQTRAK_MAX_CHORD_NOTE])).toEqual([]);
  expect(validateChordNotes([SEQTRAK_MIN_CHORD_NOTE - 1])).toContain(
    `Note ${SEQTRAK_MIN_CHORD_NOTE - 1} is outside the SEQTRAK chord range.`
  );
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm test -- --run src/domain/music.test.ts`

Expected: FAIL because the conversion exports do not exist and validation still uses the 88-key range.

- [ ] **Step 3: Implement the centralized policy and pure conversions**

In `src/domain/music.ts`, keep the two range constants together and add:

```ts
export function assertSeqtrakKeyOffset(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 11) {
    throw new Error("SEQTRAK KEY must be an integer from 0 to 11.");
  }
}

export function relativeToAbsoluteNote(note: number, keyOffset: number): number {
  assertSeqtrakKeyOffset(keyOffset);
  return note + keyOffset;
}

export function absoluteToRelativeNote(note: number, keyOffset: number): number {
  assertSeqtrakKeyOffset(keyOffset);
  return note - keyOffset;
}

export function isAbsoluteNoteSelectable(note: number, keyOffset: number): boolean {
  const relative = absoluteToRelativeNote(note, keyOffset);
  return relative >= SEQTRAK_MIN_CHORD_NOTE && relative <= SEQTRAK_MAX_CHORD_NOTE;
}
```

Change the range branch in `validateChordNotes` to:

```ts
if (note < SEQTRAK_MIN_CHORD_NOTE || note > SEQTRAK_MAX_CHORD_NOTE) {
  errors.push(`Note ${note} is outside the SEQTRAK chord range.`);
}
```

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run: `npm test -- --run src/domain/music.test.ts src/domain/packEditor.test.ts`

Expected: PASS after updating old assertions that expected the 88-key error to expect the SEQTRAK chord-range error.

- [ ] **Step 5: Commit the domain policy**

```bash
git add src/domain/music.ts src/domain/music.test.ts src/domain/packEditor.test.ts
git commit -m "feat: add KEY-relative note conversions"
```

---

### Task 2: KEY SysEx Address and Shared Parameter Receiver

**Files:**
- Create: `src/midi/parameterChangeReceiver.ts`
- Create: `src/midi/parameterChangeReceiver.test.ts`
- Modify: `src/midi/seqtrakSysex.ts`
- Modify: `src/midi/seqtrakSysex.test.ts`

**Interfaces:**
- Consumes: `MidiInputLike`, decoded `SysexAddress`, and callbacks `(value: number) => void`.
- Produces: `keyAddress(): SysexAddress` and `ParameterChangeReceiver` methods `subscribe`, `prepareWait`, and `dispose`.

- [ ] **Step 1: Write failing KEY-address and receiver tests**

Add to `src/midi/seqtrakSysex.test.ts`:

```ts
it("encodes the global KEY address", () => {
  expect(keyAddress()).toEqual([0x30, 0x40, 0x7f]);
  expect(encodeParameterRequest(keyAddress())).toEqual([
    0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7f, 0xf7
  ]);
});
```

Create `src/midi/parameterChangeReceiver.test.ts` with tests that instantiate one receiver, verify `input.listenerCount === 1`, subscribe two callbacks to `keyAddress()` and one to `scaleAddress()`, emit both addresses, unsubscribe one KEY callback, and assert only remaining callbacks run. Add a second test:

```ts
it("resolves waiters through the same stream and removes everything on dispose", async () => {
  const input = new MockMidiInput();
  const receiver = new ParameterChangeReceiver(input);
  const waiting = receiver.prepareWait(keyAddress(), 100);
  input.emit(encodeParameterChange(keyAddress(), 7));
  await expect(waiting.promise).resolves.toBe(7);
  receiver.dispose();
  expect(input.listenerCount).toBe(0);
  expect(() => receiver.prepareWait(keyAddress(), 100)).toThrow(
    "Parameter Change receiver has been disposed."
  );
});
```

Add fake-timer coverage proving a waiter rejects with `Timed out waiting for SEQTRAK response.` and removes only its temporary subscription.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/midi/seqtrakSysex.test.ts src/midi/parameterChangeReceiver.test.ts`

Expected: FAIL because `keyAddress` and `ParameterChangeReceiver` do not exist.

- [ ] **Step 3: Add the KEY address and receiver**

Add to `src/midi/seqtrakSysex.ts`:

```ts
export function keyAddress(): SysexAddress {
  return [0x30, 0x40, 0x7f];
}
```

Implement `src/midi/parameterChangeReceiver.ts` with one bound `midimessage` listener, a `Map<string, Set<(value: number) => void>>`, an address key such as `address.join(":")`, snapshot iteration via `Array.from(callbacks)`, and:

```ts
subscribe(address: SysexAddress, callback: (value: number) => void): () => void
prepareWait(address: SysexAddress, timeoutMs: number): {
  promise: Promise<number>;
  cancel: () => void;
}
dispose(): void
```

`prepareWait` must subscribe before starting its timeout, clean up on resolve/timeout/cancel, and throw immediately after disposal. Its `cancel` is idempotent and rejects the promise with `SEQTRAK parameter request was cancelled.`. `dispose` removes the MIDI listener, cancels all pending waiters, clears all subscriber sets, and is idempotent.

- [ ] **Step 4: Run receiver tests and verify GREEN**

Run: `npm test -- --run src/midi/seqtrakSysex.test.ts src/midi/parameterChangeReceiver.test.ts`

Expected: PASS, including multi-address, duplicate subscriber, timeout, self-unsubscribe, and disposal cases.

- [ ] **Step 5: Commit the reusable receiver**

```bash
git add src/midi/seqtrakSysex.ts src/midi/seqtrakSysex.test.ts src/midi/parameterChangeReceiver.ts src/midi/parameterChangeReceiver.test.ts
git commit -m "feat: dispatch Parameter Change subscriptions"
```

---

### Task 3: KEY-Aware Seqtrak Client

**Files:**
- Modify: `src/midi/seqtrakClient.ts`
- Modify: `src/midi/seqtrakClient.test.ts`

**Interfaces:**
- Consumes: `ParameterChangeReceiver`, `keyAddress()`, and relative `ChordPack` notes.
- Produces: `readCurrentKey(): Promise<number>`, `subscribeParameter(address, callback): () => void`, and `dispose(): void`; `readChordPack` and `writeChordPack` confirm KEY before chord parameters.

- [ ] **Step 1: Write failing client tests**

Add tests proving:

```ts
await expect(client.readCurrentKey()).resolves.toBe(11);
await expect(client.readCurrentKey()).rejects.toThrow("SEQTRAK KEY must be an integer from 0 to 11.");
```

Capture sent messages and assert the first message from both `readChordPack` and `writeChordPack` is `encodeParameterRequest(keyAddress())`. Respond to that request with KEY `1`, then respond to chord addresses with `[0x3c, 0x40, 0x43, 0x00]`; assert the returned stored notes remain `[60, 64, 67]` and writes send those exact values without subtracting or adding KEY.

Add a subscription test that emits unsolicited KEY and SCALE changes and proves both address callbacks receive their own values. Call `client.dispose()` and assert `input.listenerCount` becomes zero.

- [ ] **Step 2: Run client tests and verify RED**

Run: `npm test -- --run src/midi/seqtrakClient.test.ts`

Expected: FAIL because KEY methods and shared receiver integration are absent.

- [ ] **Step 3: Integrate the shared receiver**

Construct one `ParameterChangeReceiver` in `SeqtrakClient`. Replace `requestParameter`'s per-request MIDI listener with:

```ts
private async requestParameter(address: SysexAddress): Promise<number> {
  const waiting = this.receiver.prepareWait(address, this.requestTimeoutMs);
  try {
    this.output.send(encodeParameterRequest(address));
  } catch (error) {
    waiting.cancel();
    void waiting.promise.catch(() => undefined);
    throw error;
  }
  return waiting.promise;
}
```

Add:

```ts
async readCurrentKey(): Promise<number> {
  const value = await this.requestParameter(keyAddress());
  assertSeqtrakKeyOffset(value);
  return value;
}

subscribeParameter(address: SysexAddress, callback: (value: number) => void): () => void {
  return this.receiver.subscribe(address, callback);
}

dispose(): void {
  this.receiver.dispose();
}
```

Call `await this.readCurrentKey()` at the beginning of `readChordPack` and `writeChordPack`. Keep `codeValueToNote`/`noteToCodeValue` relative and unchanged apart from centralized range validation.

- [ ] **Step 4: Update listener-lifecycle assertions and verify GREEN**

Existing client tests must expect one persistent listener while the client is alive and zero only after `dispose()`. Run:

`npm test -- --run src/midi/parameterChangeReceiver.test.ts src/midi/seqtrakClient.test.ts`

Expected: PASS; a send exception cancels its waiter immediately, and no timer or subscription remains after disposal.

- [ ] **Step 5: Commit the client integration**

```bash
git add src/midi/seqtrakClient.ts src/midi/seqtrakClient.test.ts src/midi/parameterChangeReceiver.ts src/midi/parameterChangeReceiver.test.ts
git commit -m "feat: synchronize SEQTRAK KEY state"
```

---

### Task 4: KEY-Aware Editor and Keyboard

**Files:**
- Modify: `src/domain/packEditor.ts`
- Modify: `src/domain/packEditor.test.ts`
- Modify: `src/components/Keyboard88.tsx`
- Modify: `src/components/Keyboard88.test.tsx`
- Modify: `src/components/ChordGrid.tsx`
- Modify: `src/components/ChordGrid.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: transient `keyOffset`, absolute keyboard/recommendation notes, and stored relative notes.
- Produces: editor actions carrying `keyOffset`, keyboard props `keyOffset`, and chord-grid absolute pitch labels.

- [ ] **Step 1: Write failing editor and component tests**

Add reducer tests:

```ts
const next = editorReducer(state, { type: "toggleNote", absoluteNote: 61, keyOffset: 1 });
expect(next.pack.chords[0].notes).not.toContain(60);

const applied = editorReducer(state, {
  type: "replaceSelectedChordFromAbsolute",
  absoluteNotes: [61, 65, 68],
  keyOffset: 1,
  displayName: "C#"
});
expect(applied.pack.chords[0].notes).toEqual([60, 64, 67]);
```

Update the keyboard test to render `activeNotes={[60, 64, 67]}` and `keyOffset={1}`, then assert C#4 is pressed, C4 is not pressed, the absolute keys below `0x25` and above `0x61` are disabled, and clicking a disabled key invokes neither callback.

Add a chord-grid test rendering a chord with relative `[60, 64, 67]` and `keyOffset={1}` and assert the card exposes `C#4 F4 G#4`; rerender with `keyOffset={2}` and assert `D4 F#4 A4`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/domain/packEditor.test.ts src/components/Keyboard88.test.tsx src/components/ChordGrid.test.tsx`

Expected: FAIL because actions and components do not accept KEY-aware inputs.

- [ ] **Step 3: Convert only at editor and presentation boundaries**

Replace the toggle action with:

```ts
{ type: "toggleNote"; absoluteNote: number; keyOffset: number }
```

and the replacement action with:

```ts
{
  type: "replaceSelectedChordFromAbsolute";
  absoluteNotes: number[];
  keyOffset: number;
  displayName: string;
}
```

Convert with `absoluteToRelativeNote` before existing note-count and validation logic.

Add `keyOffset: number` to `Keyboard88Props`. Derive `absoluteActiveNotes = activeNotes.map(note => relativeToAbsoluteNote(note, keyOffset))`; set `disabled={!isAbsoluteNoteSelectable(note, keyOffset)}` and pass absolute notes to callbacks only for enabled buttons.

Add `keyOffset: number` to `ChordGridProps`. Derive pitch names with:

```ts
const pitchNames = chord.notes
  .map((note) => relativeToAbsoluteNote(note, keyOffset))
  .map(midiNoteName)
  .join(" ");
```

Render the existing `displayName` and a separate pitch-name element so recommendation labels are not destroyed by KEY changes.

Add a `.piano-key:disabled` rule that visibly dims disabled keys and uses `cursor: not-allowed` without removing black/white key geometry.

- [ ] **Step 4: Run editor/component tests and verify GREEN**

Run: `npm test -- --run src/domain/packEditor.test.ts src/components/Keyboard88.test.tsx src/components/ChordGrid.test.tsx`

Expected: PASS for KEY 0, 1, and 11, including boundary disablement.

- [ ] **Step 5: Commit the KEY-aware editor UI**

```bash
git add src/domain/packEditor.ts src/domain/packEditor.test.ts src/components/Keyboard88.tsx src/components/Keyboard88.test.tsx src/components/ChordGrid.tsx src/components/ChordGrid.test.tsx src/styles.css
git commit -m "feat: map relative chords onto the keyboard"
```

---

### Task 5: Application KEY Lifecycle and Preview

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/midi/deviceWorkflow.ts`
- Modify: `src/midi/deviceWorkflow.test.ts`
- Modify: `src/midi/midiAccessService.ts`
- Modify: `src/midi/midiAccessService.test.ts`
- Modify: `src/midi/midiTypes.ts`

**Interfaces:**
- Consumes: `SeqtrakClient.readCurrentKey`, `subscribeParameter`, `dispose`, relative editor notes, and absolute recommendation voicings.
- Produces: transient React `seqtrakKeyOffset`, live KEY updates, physical-disconnect KEY-0 reset, and absolute preview calls.

- [ ] **Step 1: Write failing application lifecycle tests**

Extend the mocked client with `readCurrentKey`, `subscribeParameter`, and `dispose`. Capture the KEY callback. Add tests proving:

- connecting requests KEY and renders relative `[60, 64, 67]` at `[61, 65, 68]` when KEY is `1`;
- invoking the captured callback with `2` moves pressed keys and displayed pitches without changing the pack's relative notes;
- keyboard preview calls `playNote(62)` while reducer storage toggles relative `60` at KEY `2`;
- chord preview calls `playChord(relativeNotes.map(note => note + keyOffset))`;
- applying recommendation absolute notes stores notes after subtracting KEY;
- an unsolicited KEY value `12` leaves the last valid KEY unchanged and shows `SEQTRAK KEY must be an integer from 0 to 11.`;
- reconnect and unmount call the previous client's unsubscribe and `dispose`, then reset behavior to KEY `0`.
- a MIDI `statechange` for either selected port with `state === "disconnected"` calls the same cleanup and resets KEY to `0`.

Update workflow fakes so `readChordPack` and `writeChordPack` model their internal pre-operation KEY check, and keep verification comparisons relative.

Add a `midiAccessService` test with a fake access object that records one `statechange` listener, invokes it with `{ port: { id: "mock-input", state: "disconnected" } }`, verifies the application callback receives that port, calls the returned unsubscribe function, and verifies the fake access object's listener count is zero.

- [ ] **Step 2: Run application/workflow tests and verify RED**

Run: `npm test -- --run src/App.test.tsx src/midi/deviceWorkflow.test.ts`

Expected: FAIL because App has no transient KEY state or subscription lifecycle.

- [ ] **Step 3: Implement the transient KEY lifecycle**

Extend the access-like type and `MidiAccessResult` in `midiAccessService.ts`:

```ts
export interface MidiPortStateChangeEventLike {
  port: { id: string; state?: "connected" | "disconnected" };
}

export interface MidiAccessResult {
  inputs: MidiInputLike[];
  outputs: MidiOutputLike[];
  subscribeStateChange(
    callback: (event: MidiPortStateChangeEventLike) => void
  ): () => void;
}
```

`requestAccess()` implements `subscribeStateChange` by forwarding to the underlying MIDIAccess `addEventListener("statechange", callback)` and returning a closure that calls the matching `removeEventListener`.

In `App.tsx`, add:

```ts
const [seqtrakKeyOffset, setSeqtrakKeyOffset] = useState(0);
const keyUnsubscribeRef = useRef<(() => void) | null>(null);
const stateUnsubscribeRef = useRef<(() => void) | null>(null);

const releaseClient = useCallback(() => {
  stateUnsubscribeRef.current?.();
  stateUnsubscribeRef.current = null;
  keyUnsubscribeRef.current?.();
  keyUnsubscribeRef.current = null;
  clientRef.current?.dispose();
  clientRef.current = null;
  setSeqtrakKeyOffset(0);
}, []);
```

On connect, release the old client, construct the new client, subscribe to `keyAddress()`, validate each callback value with `assertSeqtrakKeyOffset`, then call `readCurrentKey()` before setting connected status. Subscribe to access state changes and call `releaseClient` plus `setDeviceStatus("disconnected")` when either selected port id reports `state === "disconnected"`. On failure, release the client. Add a `useEffect` cleanup returning `releaseClient`.

Pass `seqtrakKeyOffset` to `Keyboard88` and `ChordGrid`. Keyboard callbacks already receive absolute notes; include the offset in reducer actions. Convert stored relative notes with `relativeToAbsoluteNote` immediately before `playChord`; single keyboard notes are already absolute. Convert recommendation absolute notes through the KEY-aware reducer action.

After successful read or write, use the latest value delivered by the KEY subscription; explicit client KEY requests flow through the same receiver and update state. Do not add KEY to `ChordPack` or workflow return objects.

- [ ] **Step 4: Run application/workflow tests and verify GREEN**

Run: `npm test -- --run src/App.test.tsx src/midi/deviceWorkflow.test.ts src/midi/seqtrakClient.test.ts`

Expected: PASS, including live KEY notification, invalid notification, preview, reconnect, and unmount cleanup.

- [ ] **Step 5: Commit the application lifecycle**

```bash
git add src/App.tsx src/App.test.tsx src/midi/deviceWorkflow.ts src/midi/deviceWorkflow.test.ts src/midi/midiAccessService.ts src/midi/midiAccessService.test.ts src/midi/midiTypes.ts
git commit -m "feat: follow live SEQTRAK KEY changes"
```

---

### Task 6: Full Verification and Manual Test Documentation

**Files:**
- Modify: `docs/manual-tests/seqtrak-phase-2.md`

**Interfaces:**
- Consumes: completed KEY-relative implementation.
- Produces: repeatable device verification for KEY, range boundaries, notifications, and read-back.

- [ ] **Step 1: Add the exact manual verification sequence**

Append a `KEY-relative chord verification` section covering:

1. Set device KEY to `0`, read all seven slots, and compare every highlighted/previewed note with SEQTRAK.
2. Change KEY to `1` on SEQTRAK without rereading; verify all highlights, pitch names, selectable boundaries, and previews move up one semitone.
3. Change KEY to `11`; repeat the verification and test relative values `0x24` and `0x60`.
4. Edit an enabled absolute key, write, reread, and verify the raw relative chord value is unchanged by KEY.
5. Verify keys outside `0x24 + KEY .. 0x60 + KEY` are disabled.
6. Disconnect SEQTRAK and verify the same relative pack displays and previews at KEY `0`.
7. Record any observed device range different from `0x24..0x60`; change only the centralized range constants in a separate reviewed change.

- [ ] **Step 2: Run formatting, unit, server, and production-build verification**

Run:

```bash
npm test -- --run
npm run test:server
npm run build
git diff --check
```

Expected: 0 failures; all Vitest files and five static-server tests pass; Vite production build succeeds; `git diff --check` prints nothing.

- [ ] **Step 3: Inspect the final diff for forbidden persistence and conversion leaks**

Run:

```bash
rg -n "seqtrakKeyOffset" src
rg -n "relativeToAbsoluteNote|absoluteToRelativeNote" src
git diff --stat HEAD~5..HEAD
```

Expected: no `seqtrakKeyOffset` field in `ChordPack`; conversions appear only in domain helpers and UI/edit/preview boundaries; SysEx read/write keeps relative values.

- [ ] **Step 4: Commit the manual verification guide**

```bash
git add docs/manual-tests/seqtrak-phase-2.md
git commit -m "docs: add KEY-relative device checks"
```
