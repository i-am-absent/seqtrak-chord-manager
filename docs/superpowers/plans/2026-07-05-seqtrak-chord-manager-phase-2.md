# SEQTRAK Chord Manager Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Web MIDI and SEQTRAK SysEx support so the app can read the current SCALE, read one track's sound name and seven chord slots, write the edited seven chord slots back to a selected track, and verify the write.

**Architecture:** Keep SysEx encoding/decoding and address math as pure TypeScript modules with exhaustive tests. Put request/response timing and Web MIDI port handling behind small services so most behavior can be tested with mock ports before using a real SEQTRAK. Wire the device workflow into the existing local editor without adding Supabase or public pack browsing.

**Tech Stack:** React, TypeScript, Vitest, Web MIDI API, existing Vite app.

---

## Confirmed SEQTRAK SysEx Facts

Parameter Change:

```text
F0 43 10 7F 1C 0C ah am al vv F7
```

Parameter Request:

```text
F0 43 30 7F 1C 0C ah am al F7
```

Rules:

- Request responses return as Parameter Change with byte 3 equal to `0x10`.
- No checksum.
- `ah am al` is the 3-byte parameter address.
- `vv` is the parameter value.
- Track indexes are `0..9`.
- Track labels are fixed: `KICK`, `SNARE`, `CLAP`, `HAT1`, `HAT2`, `PERC1`, `PERC2`, `SYNTH1`, `SYNTH2`, `DX`.
- Current SCALE address is `30 40 7E`.
- Track sound name address is `31 0t xx`; ASCII, `0x00` terminated; ignore address `xx = 0x00` if it returns `0x00`, and display from byte position `0x01` onward.
- Code address is `30 6t xx` for SCALE `0..3`, and `30 7t xx` for SCALE `4..7`.
- For track `7`, the second address byte is `0x67` for scales `0..3` and `0x77` for scales `4..7`.
- SCALE-local code offsets:
  - scale group offset `0x00` for scale `0` or `4`
  - scale group offset `0x20` for scale `1` or `5`
  - scale group offset `0x40` for scale `2` or `6`
  - scale group offset `0x60` for scale `3` or `7`
  - pad offset: `(slotIndex - 1) * 4`
  - note offset: `noteIndex 0..3`
- Code values:
  - `0x00` means note off.
  - `0x24..0x60` are MIDI note numbers and should be used as app note numbers.

## File Structure

Create:

- `src/midi/seqtrakSysex.ts`: pure SysEx frame encoding, decoding, address helpers, code value conversion, sound-name decoding.
- `src/midi/seqtrakSysex.test.ts`: fixtures for all address and conversion rules.
- `src/midi/midiTypes.ts`: small local interfaces for MIDI access, inputs, outputs, messages, and connection status so tests do not depend on browser DOM typings.
- `src/midi/mockMidi.ts`: deterministic mock MIDI input/output ports for tests.
- `src/midi/seqtrakClient.ts`: request/response client that sends Parameter Request/Change frames and waits for matching responses.
- `src/midi/seqtrakClient.test.ts`: mocked port tests for SCALE, sound name, read pack, write pack, timeout, and write verification.
- `src/midi/midiAccessService.ts`: browser Web MIDI wrapper.
- `src/midi/midiAccessService.test.ts`: requestMIDIAccess feature detection and permission behavior with mocked `navigator`.
- `src/components/DevicePanel.tsx`: connection and track controls.
- `src/components/DevicePanel.test.tsx`: device panel interaction tests.

Modify:

- `src/domain/music.ts`: add `seqtrakTracks`, `SeqtrakTrackIndex`, and SEQTRAK note range constants.
- `src/domain/packEditor.ts`: add actions to replace the whole pack and set status messages.
- `src/domain/packEditor.test.ts`: tests for replacing imported pack state.
- `src/App.tsx`: wire connection state, selected track, read, write, and confirmation.
- `src/App.test.tsx`: integration tests for mocked read/write flows.
- `src/styles.css`: device panel layout.

Do not implement Supabase, public pack browsing, anonymous deletion, or aggregate recommendation ranking in this phase.

---

### Task 1: Add SEQTRAK Track Constants and Editor Import Action

**Files:**
- Modify: `src/domain/music.ts`
- Modify: `src/domain/music.test.ts`
- Modify: `src/domain/packEditor.ts`
- Modify: `src/domain/packEditor.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/domain/music.test.ts`:

```ts
import { seqtrakTracks, SEQTRAK_MAX_CHORD_NOTE, SEQTRAK_MIN_CHORD_NOTE } from "./music";

it("defines the ten SEQTRAK code-capable tracks", () => {
  expect(seqtrakTracks).toEqual([
    { index: 0, name: "KICK" },
    { index: 1, name: "SNARE" },
    { index: 2, name: "CLAP" },
    { index: 3, name: "HAT1" },
    { index: 4, name: "HAT2" },
    { index: 5, name: "PERC1" },
    { index: 6, name: "PERC2" },
    { index: 7, name: "SYNTH1" },
    { index: 8, name: "SYNTH2" },
    { index: 9, name: "DX" }
  ]);
  expect(SEQTRAK_MIN_CHORD_NOTE).toBe(0x24);
  expect(SEQTRAK_MAX_CHORD_NOTE).toBe(0x60);
});
```

Append to `src/domain/packEditor.test.ts`:

```ts
it("replaces the editable pack after a device import", () => {
  const state = createEditorState(createDefaultPack());
  const imported = {
    ...createDefaultPack(),
    packName: "Imported SYNTH1 Scale 2",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 7,
    chords: createDefaultPack().chords.map((chord) =>
      chord.slotIndex === 1 ? { ...chord, notes: [48, 52, 55], displayName: "Imported" } : chord
    )
  };

  const next = editorReducer(state, { type: "replacePack", pack: imported, message: "Read SYNTH1." });

  expect(next.pack).toEqual(imported);
  expect(next.selectedSlotIndex).toBe(1);
  expect(next.message).toBe("Read SYNTH1.");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/domain/music.test.ts src/domain/packEditor.test.ts
```

Expected: FAIL because `seqtrakTracks`, note constants, and `replacePack` do not exist.

- [ ] **Step 3: Implement constants and reducer action**

Add to `src/domain/music.ts`:

```ts
export const SEQTRAK_MIN_CHORD_NOTE = 0x24;
export const SEQTRAK_MAX_CHORD_NOTE = 0x60;

export const seqtrakTracks = [
  { index: 0, name: "KICK" },
  { index: 1, name: "SNARE" },
  { index: 2, name: "CLAP" },
  { index: 3, name: "HAT1" },
  { index: 4, name: "HAT2" },
  { index: 5, name: "PERC1" },
  { index: 6, name: "PERC2" },
  { index: 7, name: "SYNTH1" },
  { index: 8, name: "SYNTH2" },
  { index: 9, name: "DX" }
] as const;

export type SeqtrakTrackIndex = (typeof seqtrakTracks)[number]["index"];
```

Update `EditorAction` in `src/domain/packEditor.ts`:

```ts
  | { type: "replacePack"; pack: ChordPack; message?: string }
  | { type: "setMessage"; message: string };
```

Add reducer cases:

```ts
    case "replacePack":
      return {
        pack: action.pack,
        selectedSlotIndex: 1,
        message: action.message ?? ""
      };
    case "setMessage":
      return {
        ...state,
        message: action.message
      };
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/domain/music.test.ts src/domain/packEditor.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/music.ts src/domain/music.test.ts src/domain/packEditor.ts src/domain/packEditor.test.ts
git commit -m "feat: add SEQTRAK track domain constants"
```

---

### Task 2: Implement Pure SysEx Encoding and Address Math

**Files:**
- Create: `src/midi/seqtrakSysex.ts`
- Create: `src/midi/seqtrakSysex.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/midi/seqtrakSysex.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  codeValueToNote,
  decodeParameterChange,
  decodeSoundName,
  encodeParameterChange,
  encodeParameterRequest,
  encodeTrackChordAddress,
  encodeTrackSoundNameAddress,
  noteToCodeValue,
  scaleAddress
} from "./seqtrakSysex";

describe("SEQTRAK SysEx helpers", () => {
  it("encodes request and change frames", () => {
    expect(encodeParameterRequest([0x30, 0x40, 0x7e])).toEqual([
      0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7
    ]);
    expect(encodeParameterChange([0x30, 0x67, 0x00], 0x3c)).toEqual([
      0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x00, 0x3c, 0xf7
    ]);
  });

  it("decodes parameter change responses", () => {
    expect(decodeParameterChange([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0x05, 0xf7])).toEqual({
      address: [0x30, 0x40, 0x7e],
      value: 0x05
    });
    expect(decodeParameterChange([0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7])).toBeNull();
  });

  it("builds scale, sound, and chord addresses", () => {
    expect(scaleAddress()).toEqual([0x30, 0x40, 0x7e]);
    expect(encodeTrackSoundNameAddress(2, 0x0c)).toEqual([0x31, 0x02, 0x0c]);
    expect(encodeTrackChordAddress({ trackIndex: 7, scale: 0, slotIndex: 1, noteIndex: 0 })).toEqual([0x30, 0x67, 0x00]);
    expect(encodeTrackChordAddress({ trackIndex: 7, scale: 3, slotIndex: 7, noteIndex: 3 })).toEqual([0x30, 0x67, 0x7b]);
    expect(encodeTrackChordAddress({ trackIndex: 7, scale: 4, slotIndex: 1, noteIndex: 0 })).toEqual([0x30, 0x77, 0x00]);
    expect(encodeTrackChordAddress({ trackIndex: 9, scale: 6, slotIndex: 2, noteIndex: 1 })).toEqual([0x30, 0x79, 0x45]);
  });

  it("converts code values and notes", () => {
    expect(codeValueToNote(0x00)).toBeNull();
    expect(codeValueToNote(0x24)).toBe(36);
    expect(codeValueToNote(0x60)).toBe(96);
    expect(() => codeValueToNote(0x23)).toThrow("Invalid SEQTRAK chord note value 35.");
    expect(noteToCodeValue(null)).toBe(0x00);
    expect(noteToCodeValue(60)).toBe(0x3c);
    expect(() => noteToCodeValue(20)).toThrow("Note 20 is outside the SEQTRAK chord range.");
  });

  it("decodes sound names from ASCII values, ignoring byte zero null", () => {
    const bytes = [0x00, 0x50, 0x61, 0x64, 0x00, 0x58];
    expect(decodeSoundName(bytes)).toBe("Pad");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/midi/seqtrakSysex.test.ts
```

Expected: FAIL because `src/midi/seqtrakSysex.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `src/midi/seqtrakSysex.ts` with these exports and behavior:

```ts
import { SEQTRAK_MAX_CHORD_NOTE, SEQTRAK_MIN_CHORD_NOTE, type SeqtrakTrackIndex } from "../domain/music";

export type SysexAddress = readonly [number, number, number];

const REQUEST_HEADER = [0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c] as const;
const CHANGE_HEADER = [0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c] as const;

export function encodeParameterRequest(address: SysexAddress): number[] {
  return [...REQUEST_HEADER, ...address, 0xf7];
}

export function encodeParameterChange(address: SysexAddress, value: number): number[] {
  return [...CHANGE_HEADER, ...address, value, 0xf7];
}

export function decodeParameterChange(data: ArrayLike<number>): { address: SysexAddress; value: number } | null {
  const bytes = Array.from(data);
  if (bytes.length !== 11) return null;
  if (!CHANGE_HEADER.every((byte, index) => bytes[index] === byte)) return null;
  if (bytes[10] !== 0xf7) return null;
  return { address: [bytes[6], bytes[7], bytes[8]], value: bytes[9] };
}

export function scaleAddress(): SysexAddress {
  return [0x30, 0x40, 0x7e];
}

export function encodeTrackSoundNameAddress(trackIndex: SeqtrakTrackIndex, byteIndex: number): SysexAddress {
  assertRange(trackIndex, 0, 9, "trackIndex");
  assertRange(byteIndex, 0, 0x63, "sound name byte index");
  return [0x31, trackIndex, byteIndex];
}

export function encodeTrackChordAddress(input: {
  trackIndex: SeqtrakTrackIndex;
  scale: number;
  slotIndex: number;
  noteIndex: number;
}): SysexAddress {
  assertRange(input.trackIndex, 0, 9, "trackIndex");
  assertRange(input.scale, 0, 7, "scale");
  assertRange(input.slotIndex, 1, 7, "slotIndex");
  assertRange(input.noteIndex, 0, 3, "noteIndex");
  const scaleBank = input.scale < 4 ? 0x60 : 0x70;
  const scaleGroup = input.scale % 4;
  const offset = scaleGroup * 0x20 + (input.slotIndex - 1) * 4 + input.noteIndex;
  return [0x30, scaleBank + input.trackIndex, offset];
}

export function codeValueToNote(value: number): number | null {
  if (value === 0x00) return null;
  if (value < SEQTRAK_MIN_CHORD_NOTE || value > SEQTRAK_MAX_CHORD_NOTE) {
    throw new Error(`Invalid SEQTRAK chord note value ${value}.`);
  }
  return value;
}

export function noteToCodeValue(note: number | null): number {
  if (note === null) return 0x00;
  if (!Number.isInteger(note) || note < SEQTRAK_MIN_CHORD_NOTE || note > SEQTRAK_MAX_CHORD_NOTE) {
    throw new Error(`Note ${note} is outside the SEQTRAK chord range.`);
  }
  return note;
}

export function decodeSoundName(values: number[]): string {
  const chars = values.slice(1);
  const terminatorIndex = chars.indexOf(0x00);
  const visible = terminatorIndex >= 0 ? chars.slice(0, terminatorIndex) : chars;
  return String.fromCharCode(...visible);
}

function assertRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/midi/seqtrakSysex.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/midi/seqtrakSysex.ts src/midi/seqtrakSysex.test.ts
git commit -m "feat: add SEQTRAK SysEx helpers"
```

---

### Task 3: Implement Mock MIDI Ports and SEQTRAK Client

**Files:**
- Create: `src/midi/midiTypes.ts`
- Create: `src/midi/mockMidi.ts`
- Create: `src/midi/seqtrakClient.ts`
- Create: `src/midi/seqtrakClient.test.ts`

- [ ] **Step 1: Write failing client tests**

Create `src/midi/seqtrakClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultPack } from "../domain/music";
import { encodeParameterChange, encodeTrackChordAddress, encodeTrackSoundNameAddress, scaleAddress } from "./seqtrakSysex";
import { MockMidiInput, MockMidiOutput } from "./mockMidi";
import { SeqtrakClient } from "./seqtrakClient";

describe("SeqtrakClient", () => {
  it("reads current scale", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(input, (sent) => {
      expect(sent).toEqual([0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7]);
      input.emit(encodeParameterChange(scaleAddress(), 3));
    });
    const client = new SeqtrakClient(input, output);
    await expect(client.readCurrentScale()).resolves.toBe(3);
  });

  it("reads a track sound name from ASCII bytes", async () => {
    const input = new MockMidiInput();
    const values = new Map<number, number>([
      [1, 0x50],
      [2, 0x61],
      [3, 0x64],
      [4, 0x00]
    ]);
    const output = new MockMidiOutput(input, (sent) => {
      const xx = sent[8];
      input.emit(encodeParameterChange(encodeTrackSoundNameAddress(7, xx), values.get(xx) ?? 0));
    });
    const client = new SeqtrakClient(input, output);
    await expect(client.readTrackSoundName(7)).resolves.toBe("Pad");
  });

  it("reads seven chord slots for the current scale", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(input, (sent) => {
      const address = [sent[6], sent[7], sent[8]] as const;
      const value = sent[8] === 0x00 ? 0x3c : sent[8] === 0x01 ? 0x40 : sent[8] === 0x02 ? 0x43 : 0x00;
      input.emit(encodeParameterChange(address, value));
    });
    const client = new SeqtrakClient(input, output);
    const pack = await client.readChordPack({ trackIndex: 7, scale: 0, trackSoundName: "Pad" });
    expect(pack.sourceTrackIndex).toBe(7);
    expect(pack.trackSoundName).toBe("Pad");
    expect(pack.chords).toHaveLength(7);
    expect(pack.chords[0].notes).toEqual([60, 64, 67]);
  });

  it("writes all 28 chord parameters", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(input);
    const client = new SeqtrakClient(input, output);
    const pack = createDefaultPack();
    await client.writeChordPack({ trackIndex: 7, scale: 0, pack });
    expect(output.sentMessages).toHaveLength(28);
    expect(output.sentMessages[0]).toEqual([
      0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x00, 0x3c, 0xf7
    ]);
  });

  it("times out when a requested parameter never responds", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(input);
    const client = new SeqtrakClient(input, output, { requestTimeoutMs: 1 });
    await expect(client.readCurrentScale()).rejects.toThrow("Timed out waiting for SEQTRAK response");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/midi/seqtrakClient.test.ts
```

Expected: FAIL because client and mock files do not exist.

- [ ] **Step 3: Implement MIDI types and mocks**

Create `src/midi/midiTypes.ts`:

```ts
export interface MidiMessageEventLike {
  data: Uint8Array;
}

export interface MidiInputLike {
  id: string;
  name: string;
  addEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
  removeEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
}

export interface MidiOutputLike {
  id: string;
  name: string;
  send(data: number[] | Uint8Array): void;
}
```

Create `src/midi/mockMidi.ts`:

```ts
import type { MidiInputLike, MidiMessageEventLike, MidiOutputLike } from "./midiTypes";

export class MockMidiInput implements MidiInputLike {
  id = "mock-input";
  name = "Mock MIDI Input";
  private listeners = new Set<(event: MidiMessageEventLike) => void>();

  addEventListener(_type: "midimessage", listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "midimessage", listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.delete(listener);
  }

  emit(data: number[]): void {
    for (const listener of this.listeners) {
      listener({ data: Uint8Array.from(data) });
    }
  }
}

export class MockMidiOutput implements MidiOutputLike {
  id = "mock-output";
  name = "Mock MIDI Output";
  sentMessages: number[][] = [];

  constructor(
    private input?: MockMidiInput,
    private onSend?: (data: number[]) => void
  ) {}

  send(data: number[] | Uint8Array): void {
    const bytes = Array.from(data);
    this.sentMessages.push(bytes);
    this.onSend?.(bytes);
    void this.input;
  }
}
```

- [ ] **Step 4: Implement `SeqtrakClient`**

Create `src/midi/seqtrakClient.ts` with this public API:

```ts
import { createDefaultPack, type ChordPack, type SeqtrakTrackIndex } from "../domain/music";
import type { MidiInputLike, MidiMessageEventLike, MidiOutputLike } from "./midiTypes";
import {
  codeValueToNote,
  decodeParameterChange,
  decodeSoundName,
  encodeParameterChange,
  encodeParameterRequest,
  encodeTrackChordAddress,
  encodeTrackSoundNameAddress,
  noteToCodeValue,
  scaleAddress,
  type SysexAddress
} from "./seqtrakSysex";

interface SeqtrakClientOptions {
  requestTimeoutMs?: number;
}

export class SeqtrakClient {
  private requestTimeoutMs: number;

  constructor(
    private input: MidiInputLike,
    private output: MidiOutputLike,
    options: SeqtrakClientOptions = {}
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 800;
  }

  async readCurrentScale(): Promise<number> {
    const value = await this.requestParameter(scaleAddress());
    if (value < 0 || value > 7) throw new Error(`SEQTRAK returned invalid SCALE ${value}.`);
    return value;
  }

  async readTrackSoundName(trackIndex: SeqtrakTrackIndex): Promise<string> {
    const values: number[] = [];
    for (let byteIndex = 0; byteIndex <= 0x63; byteIndex += 1) {
      const value = await this.requestParameter(encodeTrackSoundNameAddress(trackIndex, byteIndex));
      values.push(value);
      if (byteIndex > 0 && value === 0x00) break;
    }
    return decodeSoundName(values) || "Unknown sound";
  }

  async readChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    trackSoundName: string;
  }): Promise<ChordPack> {
    const base = createDefaultPack();
    const chords = [];
    for (let slotIndex = 1; slotIndex <= 7; slotIndex += 1) {
      const notes: number[] = [];
      for (let noteIndex = 0; noteIndex < 4; noteIndex += 1) {
        const value = await this.requestParameter(
          encodeTrackChordAddress({ trackIndex: input.trackIndex, scale: input.scale, slotIndex, noteIndex })
        );
        const note = codeValueToNote(value);
        if (note !== null) notes.push(note);
      }
      chords.push({
        slotIndex,
        notes: notes.length > 0 ? notes : [60],
        displayName: notes.length > 0 ? `Slot ${slotIndex}` : "Empty"
      });
    }
    return {
      ...base,
      packName: `${input.trackSoundName} Scale ${input.scale}`,
      trackSoundName: input.trackSoundName,
      sourceTrackIndex: input.trackIndex,
      chords
    };
  }

  async writeChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    pack: ChordPack;
  }): Promise<void> {
    for (const chord of input.pack.chords) {
      for (let noteIndex = 0; noteIndex < 4; noteIndex += 1) {
        const note = chord.notes[noteIndex] ?? null;
        const address = encodeTrackChordAddress({
          trackIndex: input.trackIndex,
          scale: input.scale,
          slotIndex: chord.slotIndex,
          noteIndex
        });
        this.output.send(encodeParameterChange(address, noteToCodeValue(note)));
      }
    }
  }

  private requestParameter(address: SysexAddress): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.input.removeEventListener("midimessage", listener);
        reject(new Error("Timed out waiting for SEQTRAK response."));
      }, this.requestTimeoutMs);

      const listener = (event: MidiMessageEventLike) => {
        const decoded = decodeParameterChange(event.data);
        if (!decoded) return;
        if (!sameAddress(decoded.address, address)) return;
        window.clearTimeout(timeout);
        this.input.removeEventListener("midimessage", listener);
        resolve(decoded.value);
      };

      this.input.addEventListener("midimessage", listener);
      this.output.send(encodeParameterRequest(address));
    });
  }
}

function sameAddress(left: SysexAddress, right: SysexAddress): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}
```

If Vitest complains about `window.setTimeout` in Node-like tests, use `globalThis.setTimeout` and `globalThis.clearTimeout` instead. Keep the same behavior.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/midi/seqtrakClient.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/midi/midiTypes.ts src/midi/mockMidi.ts src/midi/seqtrakClient.ts src/midi/seqtrakClient.test.ts
git commit -m "feat: add SEQTRAK MIDI client"
```

---

### Task 4: Add Browser Web MIDI Access Service

**Files:**
- Create: `src/midi/midiAccessService.ts`
- Create: `src/midi/midiAccessService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/midi/midiAccessService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createMidiAccessService } from "./midiAccessService";

describe("midiAccessService", () => {
  it("reports unsupported browsers", async () => {
    const service = createMidiAccessService({});
    await expect(service.requestAccess()).rejects.toThrow("This browser does not support Web MIDI.");
  });

  it("requests Web MIDI with sysex enabled and lists ports", async () => {
    const input = { id: "in-1", name: "SEQTRAK Input" };
    const output = { id: "out-1", name: "SEQTRAK Output" };
    const requestMIDIAccess = vi.fn().mockResolvedValue({
      inputs: new Map([[input.id, input]]),
      outputs: new Map([[output.id, output]])
    });
    const service = createMidiAccessService({ requestMIDIAccess });
    const access = await service.requestAccess();
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: true });
    expect(access.inputs).toEqual([input]);
    expect(access.outputs).toEqual([output]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/midi/midiAccessService.test.ts
```

Expected: FAIL because `midiAccessService.ts` does not exist.

- [ ] **Step 3: Implement service**

Create `src/midi/midiAccessService.ts`:

```ts
import type { MidiInputLike, MidiOutputLike } from "./midiTypes";

interface NavigatorMidiLike {
  requestMIDIAccess?: (options: { sysex: boolean }) => Promise<{
    inputs: Map<string, MidiInputLike>;
    outputs: Map<string, MidiOutputLike>;
  }>;
}

export interface MidiAccessResult {
  inputs: MidiInputLike[];
  outputs: MidiOutputLike[];
}

export function createMidiAccessService(navigatorLike: NavigatorMidiLike = navigator as NavigatorMidiLike) {
  return {
    async requestAccess(): Promise<MidiAccessResult> {
      if (!navigatorLike.requestMIDIAccess) {
        throw new Error("This browser does not support Web MIDI.");
      }
      const access = await navigatorLike.requestMIDIAccess({ sysex: true });
      return {
        inputs: Array.from(access.inputs.values()),
        outputs: Array.from(access.outputs.values())
      };
    }
  };
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/midi/midiAccessService.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/midi/midiAccessService.ts src/midi/midiAccessService.test.ts
git commit -m "feat: add Web MIDI access service"
```

---

### Task 5: Add Device Panel Component

**Files:**
- Create: `src/components/DevicePanel.tsx`
- Create: `src/components/DevicePanel.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing tests**

Create `src/components/DevicePanel.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { seqtrakTracks } from "../domain/music";
import { renderApp } from "../test/render";
import { DevicePanel } from "./DevicePanel";

describe("DevicePanel", () => {
  it("renders connection controls and track selector", async () => {
    const onConnect = vi.fn();
    const onRead = vi.fn();
    const onWrite = vi.fn();
    const onTrackChange = vi.fn();
    renderApp(
      <DevicePanel
        status="disconnected"
        inputs={[]}
        outputs={[]}
        selectedTrackIndex={7}
        currentScale={null}
        onConnect={onConnect}
        onRead={onRead}
        onWrite={onWrite}
        onTrackChange={onTrackChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
    expect(onConnect).toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText("Target track"), "8");
    expect(onTrackChange).toHaveBeenCalledWith(8);
    expect(screen.getByText("Current SCALE: unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
    expect(screen.getAllByRole("option")).toHaveLength(seqtrakTracks.length);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/components/DevicePanel.test.tsx
```

Expected: FAIL because `DevicePanel.tsx` does not exist.

- [ ] **Step 3: Implement component**

Create `src/components/DevicePanel.tsx`:

```tsx
import { seqtrakTracks, type SeqtrakTrackIndex } from "../domain/music";
import type { MidiInputLike, MidiOutputLike } from "../midi/midiTypes";

type DeviceStatus = "unsupported" | "disconnected" | "connected" | "busy" | "error";

interface DevicePanelProps {
  status: DeviceStatus;
  inputs: MidiInputLike[];
  outputs: MidiOutputLike[];
  selectedTrackIndex: SeqtrakTrackIndex;
  currentScale: number | null;
  onConnect: () => void;
  onRead: () => void;
  onWrite: () => void;
  onTrackChange: (trackIndex: SeqtrakTrackIndex) => void;
}

export function DevicePanel({
  status,
  inputs,
  outputs,
  selectedTrackIndex,
  currentScale,
  onConnect,
  onRead,
  onWrite,
  onTrackChange
}: DevicePanelProps) {
  const connected = status === "connected";
  const busy = status === "busy";

  return (
    <section className="device-panel" aria-label="SEQTRAK device">
      <div className="device-actions">
        <button type="button" onClick={onConnect} disabled={busy}>
          Connect SEQTRAK
        </button>
        <button type="button" onClick={onRead} disabled={!connected || busy}>
          Read from SEQTRAK
        </button>
        <button type="button" onClick={onWrite} disabled={!connected || busy}>
          Write to SEQTRAK
        </button>
      </div>

      <label>
        Target track
        <select
          value={selectedTrackIndex}
          onChange={(event) => onTrackChange(Number(event.target.value) as SeqtrakTrackIndex)}
        >
          {seqtrakTracks.map((track) => (
            <option key={track.index} value={track.index}>
              {track.name}
            </option>
          ))}
        </select>
      </label>

      <div className="device-readout">
        <span>Status: {status}</span>
        <span>Inputs: {inputs.length}</span>
        <span>Outputs: {outputs.length}</span>
        <span>Current SCALE: {currentScale ?? "unknown"}</span>
      </div>
    </section>
  );
}
```

Append to `src/styles.css`:

```css
.device-panel {
  align-items: end;
  background: #ffffff;
  border: 1px solid #d9dde5;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(260px, auto) minmax(180px, 240px) 1fr;
  margin-bottom: 16px;
  padding: 14px 16px;
}

.device-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.device-panel button,
.device-panel select {
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  min-height: 38px;
  padding: 7px 11px;
}

.device-panel label {
  color: #4b5565;
  display: grid;
  font-size: 13px;
  font-weight: 700;
  gap: 6px;
}

.device-readout {
  color: #4b5565;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

@media (max-width: 820px) {
  .device-panel {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .device-readout {
    justify-content: flex-start;
  }
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/components/DevicePanel.test.tsx
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DevicePanel.tsx src/components/DevicePanel.test.tsx src/styles.css
git commit -m "feat: add SEQTRAK device panel"
```

---

### Task 6: Wire Device Read Flow into App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create: `src/midi/deviceWorkflow.ts`
- Create: `src/midi/deviceWorkflow.test.ts`

- [ ] **Step 1: Write workflow tests**

Create `src/midi/deviceWorkflow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultPack } from "../domain/music";
import { readPackFromSeqtrak, writePackToSeqtrak } from "./deviceWorkflow";

describe("deviceWorkflow", () => {
  it("reads scale, sound name, and pack", async () => {
    const calls: string[] = [];
    const client = {
      readCurrentScale: async () => {
        calls.push("scale");
        return 2;
      },
      readTrackSoundName: async (trackIndex: number) => {
        calls.push(`sound:${trackIndex}`);
        return "Warm Pad";
      },
      readChordPack: async (input: { trackIndex: number; scale: number; trackSoundName: string }) => {
        calls.push(`pack:${input.trackIndex}:${input.scale}:${input.trackSoundName}`);
        return { ...createDefaultPack(), trackSoundName: input.trackSoundName, sourceTrackIndex: input.trackIndex };
      }
    };

    const result = await readPackFromSeqtrak(client, 7);

    expect(calls).toEqual(["scale", "sound:7", "pack:7:2:Warm Pad"]);
    expect(result.scale).toBe(2);
    expect(result.pack.trackSoundName).toBe("Warm Pad");
  });

  it("writes then verifies by reading back", async () => {
    const pack = createDefaultPack();
    const calls: string[] = [];
    const client = {
      writeChordPack: async () => {
        calls.push("write");
      },
      readChordPack: async () => {
        calls.push("readback");
        return pack;
      }
    };

    await expect(writePackToSeqtrak(client, { trackIndex: 7, scale: 0, pack })).resolves.toEqual({
      verified: true
    });
    expect(calls).toEqual(["write", "readback"]);
  });
});
```

- [ ] **Step 2: Run workflow test and verify failure**

Run:

```bash
npm test -- src/midi/deviceWorkflow.test.ts
```

Expected: FAIL because `deviceWorkflow.ts` does not exist.

- [ ] **Step 3: Implement workflow helpers**

Create `src/midi/deviceWorkflow.ts`:

```ts
import type { ChordPack, SeqtrakTrackIndex } from "../domain/music";

export interface SeqtrakReadClient {
  readCurrentScale(): Promise<number>;
  readTrackSoundName(trackIndex: SeqtrakTrackIndex): Promise<string>;
  readChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    trackSoundName: string;
  }): Promise<ChordPack>;
}

export interface SeqtrakWriteClient {
  writeChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    pack: ChordPack;
  }): Promise<void>;
  readChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    trackSoundName: string;
  }): Promise<ChordPack>;
}

export async function readPackFromSeqtrak(client: SeqtrakReadClient, trackIndex: SeqtrakTrackIndex) {
  const scale = await client.readCurrentScale();
  const trackSoundName = await client.readTrackSoundName(trackIndex);
  const pack = await client.readChordPack({ trackIndex, scale, trackSoundName });
  return { scale, pack };
}

export async function writePackToSeqtrak(
  client: SeqtrakWriteClient,
  input: { trackIndex: SeqtrakTrackIndex; scale: number; pack: ChordPack }
): Promise<{ verified: boolean }> {
  await client.writeChordPack(input);
  const readBack = await client.readChordPack({
    trackIndex: input.trackIndex,
    scale: input.scale,
    trackSoundName: input.pack.trackSoundName
  });
  return { verified: JSON.stringify(readBack.chords) === JSON.stringify(input.pack.chords) };
}
```

- [ ] **Step 4: Modify App wiring**

Modify `src/App.tsx` to:

- import `useState`
- import `DevicePanel`
- import `createMidiAccessService`
- import `SeqtrakClient`
- import `readPackFromSeqtrak` and `writePackToSeqtrak`
- track:

```ts
const [deviceStatus, setDeviceStatus] = useState<"unsupported" | "disconnected" | "connected" | "busy" | "error">("disconnected");
const [midiInputs, setMidiInputs] = useState<MidiInputLike[]>([]);
const [midiOutputs, setMidiOutputs] = useState<MidiOutputLike[]>([]);
const [selectedTrackIndex, setSelectedTrackIndex] = useState<SeqtrakTrackIndex>(7);
const [currentScale, setCurrentScale] = useState<number | null>(null);
const clientRef = useRef<SeqtrakClient | null>(null);
```

Add handlers:

```ts
const handleConnect = useCallback(async () => {
  try {
    setDeviceStatus("busy");
    const access = await createMidiAccessService().requestAccess();
    setMidiInputs(access.inputs);
    setMidiOutputs(access.outputs);
    const input = access.inputs[0];
    const output = access.outputs[0];
    if (!input || !output) {
      setDeviceStatus("error");
      dispatch({ type: "setMessage", message: "SEQTRAK MIDI input/output ports were not found." });
      return;
    }
    clientRef.current = new SeqtrakClient(input, output);
    setDeviceStatus("connected");
    dispatch({ type: "setMessage", message: "SEQTRAK connected." });
  } catch (error) {
    setDeviceStatus(error instanceof Error && error.message.includes("Web MIDI") ? "unsupported" : "error");
    dispatch({ type: "setMessage", message: error instanceof Error ? error.message : "Failed to connect SEQTRAK." });
  }
}, []);
```

Add read handler:

```ts
const handleRead = useCallback(async () => {
  if (!clientRef.current) return;
  try {
    setDeviceStatus("busy");
    const result = await readPackFromSeqtrak(clientRef.current, selectedTrackIndex);
    setCurrentScale(result.scale);
    dispatch({ type: "replacePack", pack: result.pack, message: `Read ${result.pack.trackSoundName} at SCALE ${result.scale}.` });
    setDeviceStatus("connected");
  } catch (error) {
    setDeviceStatus("error");
    dispatch({ type: "setMessage", message: error instanceof Error ? error.message : "Failed to read from SEQTRAK." });
  }
}, [selectedTrackIndex]);
```

Add write handler:

```ts
const handleWrite = useCallback(async () => {
  if (!clientRef.current || currentScale === null) return;
  const ok = window.confirm(`Write all 7 chords to ${seqtrakTracks[selectedTrackIndex].name} at SCALE ${currentScale}?`);
  if (!ok) return;
  try {
    setDeviceStatus("busy");
    const result = await writePackToSeqtrak(clientRef.current, {
      trackIndex: selectedTrackIndex,
      scale: currentScale,
      pack: state.pack
    });
    dispatch({ type: "setMessage", message: result.verified ? "Write verified." : "Write sent, but verification did not match." });
    setDeviceStatus("connected");
  } catch (error) {
    setDeviceStatus("error");
    dispatch({ type: "setMessage", message: error instanceof Error ? error.message : "Failed to write to SEQTRAK." });
  }
}, [currentScale, selectedTrackIndex, state.pack]);
```

Render `DevicePanel` above `.editor-top`.

- [ ] **Step 5: Add App tests**

Extend `src/App.test.tsx` with a smoke assertion that device controls are present and disabled before connect:

```tsx
it("shows SEQTRAK device controls before connection", () => {
  renderApp(<App />);
  expect(screen.getByRole("button", { name: "Connect SEQTRAK" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Read from SEQTRAK" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Write to SEQTRAK" })).toBeDisabled();
  expect(screen.getByLabelText("Target track")).toHaveValue("7");
});
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/midi/deviceWorkflow.test.ts src/App.test.tsx
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/midi/deviceWorkflow.ts src/midi/deviceWorkflow.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: wire SEQTRAK read write workflow"
```

---

### Task 7: Add Manual Real-Device Verification Notes

**Files:**
- Create: `docs/manual-tests/seqtrak-phase-2.md`

- [ ] **Step 1: Create manual verification document**

Create `docs/manual-tests/seqtrak-phase-2.md`:

```md
# SEQTRAK Phase 2 Manual Verification

## Browser

- Use Chrome or Edge.
- Open the app with `npm run dev`.
- Grant Web MIDI permission with SysEx enabled when prompted.

## Connect

1. Connect SEQTRAK over USB.
2. Click `Connect SEQTRAK`.
3. Expected: status becomes `connected`, at least one input and one output are listed.

## Read

1. Select `SYNTH1`.
2. Click `Read from SEQTRAK`.
3. Expected:
   - Current SCALE is shown.
   - Track sound name appears in Track sound.
   - 7 chord slots update.
   - Each slot contains 1 to 4 visible notes on the keyboard when selected.

## Write

1. Change one chord by toggling a note.
2. Click `Write to SEQTRAK`.
3. Confirm the dialog mentions the selected track and current SCALE.
4. Expected:
   - App sends 28 Parameter Change messages.
   - App re-reads the track.
   - Message says `Write verified.`

## Edge Cases

- Disconnect SEQTRAK and click read: app should show a recovery message.
- Deny Web MIDI permission: app should explain that Web MIDI/SysEx is required.
- Select `KICK` and read: app should still attempt read because drum tracks can act as SYNTH type.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual-tests/seqtrak-phase-2.md
git commit -m "docs: add SEQTRAK manual verification steps"
```

---

## Self-Review Notes

Spec coverage in Phase 2:

- Covered: Web MIDI permission path, SysEx request/change frames, current SCALE, track sound name, seven chord-slot read/write, track selector by fixed track names, write confirmation, write verification via readback, browser unsupported path, mocked MIDI tests, manual real-device verification.
- Deferred to Phase 3: Supabase posting, public pack browser, anonymous delete token, report/hide moderation.
- Deferred to a later MIDI enhancement: SEQTRAK audition mode using MIDI Note On/Off. Phase 2 keeps Web Audio preview and focuses on SysEx read/write.

Known implementation choices:

- Empty SEQTRAK chord slots are imported as `[60]` with display name `Empty` because the current editor domain requires 1 to 4 notes. A future editor-domain change can support a truly empty imported slot if desired.
- Initial port selection uses the first MIDI input/output. If users have multiple MIDI devices, a later refinement should add explicit input/output selectors.
