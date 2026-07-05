# SEQTRAK Chord Manager Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working browser app: local one-track pack editing, 7-slot chord grid, 88-key keyboard editing, Web Audio preview seam, and rule-based recommendation UI.

**Architecture:** Use Vite + React + TypeScript for a static GitHub Pages-compatible frontend. Keep domain logic in framework-independent modules, then compose it through focused React components. Real SEQTRAK SysEx and Supabase are represented by stable interfaces in this phase and implemented in later plans.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, Web Audio API.

---

## Scope

This plan implements Phase 1 only. It produces a runnable local editor and tests the core model, validation, reducer, recommendation, and UI behavior.

Follow-on plans:

- Phase 2: Web MIDI permission, device listing, SysEx adapter, mocked MIDI integration, and real SEQTRAK verification.
- Phase 3: Supabase schema, anonymous posting, delete-token flow, pack browser, report/hide behavior.
- Phase 4: aggregate public-pack recommendation ranking.

## File Structure

Create these files:

- `package.json`: scripts and dependencies.
- `index.html`: Vite entry document.
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.setup.ts`: TypeScript and test configuration.
- `src/main.tsx`: React entry.
- `src/App.tsx`: top-level composition.
- `src/styles.css`: app layout and keyboard styling.
- `src/domain/music.ts`: notes, keys, chord slots, pack types, validation.
- `src/domain/packEditor.ts`: local editor reducer and actions.
- `src/domain/recommendations.ts`: key-based next-chord and voicing suggestions.
- `src/audio/previewEngine.ts`: Web Audio preview interface and implementation.
- `src/components/ChordGrid.tsx`: `Space 1 2 3 / 4 5 6 7` grid.
- `src/components/Keyboard88.tsx`: horizontal piano keyboard.
- `src/components/MetadataPanel.tsx`: editable pack metadata.
- `src/components/RecommendationPanel.tsx`: key override, chord-name strip, voicing variations.
- `src/test/render.tsx`: test render helper.
- Test files beside domain/components using `*.test.ts` or `*.test.tsx`.

Keep MIDI and Supabase out of Phase 1 implementation files except for button labels and disabled UI states.

---

### Task 1: Scaffold Vite React TypeScript App

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/render.tsx`

- [ ] **Step 1: Create package and config files**

Create `package.json`:

```json
{
  "name": "seqtrak-chord-manager",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest",
    "vitest": "latest"
  }
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SEQTRAK Chord Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts"
  }
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Create initial React files**

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">SEQTRAK</p>
          <h1>Chord Manager</h1>
        </div>
        <div className="device-status">Browser-only mode</div>
      </header>
      <section className="workspace">
        <p>Editor loading...</p>
      </section>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  color: #1b1c1f;
  background: #f6f7f9;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
}

.top-bar {
  align-items: center;
  background: #ffffff;
  border-bottom: 1px solid #d9dde5;
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
}

.top-bar h1 {
  font-size: 24px;
  line-height: 1.1;
  margin: 0;
}

.eyebrow {
  color: #687080;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.device-status {
  background: #eef1f6;
  border: 1px solid #cfd6e2;
  border-radius: 6px;
  padding: 8px 10px;
}

.workspace {
  padding: 20px 24px 28px;
}
```

Create `src/test/render.tsx`:

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderApp(ui: ReactElement) {
  return render(ui);
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install exits successfully.

- [ ] **Step 4: Verify scaffold**

Run:

```bash
npm test
npm run build
```

Expected: Vitest reports no test files or passes with zero tests depending on version behavior; build exits successfully and creates `dist/`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html tsconfig.json tsconfig.node.json vite.config.ts vitest.setup.ts src
git commit -m "chore: scaffold React app"
```

---

### Task 2: Add Domain Types and Validation

**Files:**
- Create: `src/domain/music.ts`
- Create: `src/domain/music.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `src/domain/music.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createDefaultPack,
  isBlackKey,
  midiNoteName,
  validateChordNotes,
  validatePack
} from "./music";

describe("music domain", () => {
  it("names MIDI notes using octave numbers", () => {
    expect(midiNoteName(21)).toBe("A0");
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(108)).toBe("C8");
  });

  it("identifies black keys", () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });

  it("validates a chord as one to four MIDI notes", () => {
    expect(validateChordNotes([60])).toEqual([]);
    expect(validateChordNotes([])).toContain("Chord must contain at least one note.");
    expect(validateChordNotes([60, 64, 67, 71, 74])).toContain(
      "Chord must contain no more than four notes."
    );
    expect(validateChordNotes([20])).toContain("Note 20 is outside the 88-key range.");
    expect(validateChordNotes([60, 60])).toContain("Chord notes must be unique.");
  });

  it("creates a valid seven-slot default pack", () => {
    const pack = createDefaultPack();
    expect(pack.chords).toHaveLength(7);
    expect(validatePack(pack)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/music.test.ts
```

Expected: FAIL because `src/domain/music.ts` does not exist.

- [ ] **Step 3: Implement domain model**

Create `src/domain/music.ts`:

```ts
export const MIN_88_KEY_MIDI_NOTE = 21;
export const MAX_88_KEY_MIDI_NOTE = 108;

export const chromaticKeys = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
] as const;

export type KeyName = (typeof chromaticKeys)[number];

export interface ChordSlot {
  slotIndex: number;
  notes: number[];
  displayName: string;
}

export interface ChordPack {
  id?: string;
  packName: string;
  authorName: string;
  tags: string[];
  key: KeyName;
  trackSoundName: string;
  sourceTrackIndex?: number;
  chords: ChordSlot[];
  createdAt?: string;
  reportedCount: number;
  hidden: boolean;
  deleted: boolean;
}

const noteNames = chromaticKeys;
const blackKeyPitchClasses = new Set([1, 3, 6, 8, 10]);

export function midiNoteName(note: number): string {
  const pitchClass = note % 12;
  const octave = Math.floor(note / 12) - 1;
  return `${noteNames[pitchClass]}${octave}`;
}

export function isBlackKey(note: number): boolean {
  return blackKeyPitchClasses.has(note % 12);
}

export function validateChordNotes(notes: number[]): string[] {
  const errors: string[] = [];
  const uniqueNotes = new Set(notes);

  if (notes.length < 1) {
    errors.push("Chord must contain at least one note.");
  }

  if (notes.length > 4) {
    errors.push("Chord must contain no more than four notes.");
  }

  if (uniqueNotes.size !== notes.length) {
    errors.push("Chord notes must be unique.");
  }

  for (const note of notes) {
    if (note < MIN_88_KEY_MIDI_NOTE || note > MAX_88_KEY_MIDI_NOTE) {
      errors.push(`Note ${note} is outside the 88-key range.`);
    }
  }

  return errors;
}

export function validatePack(pack: ChordPack): string[] {
  const errors: string[] = [];

  if (pack.chords.length !== 7) {
    errors.push("Pack must contain exactly seven chord slots.");
  }

  for (const chord of pack.chords) {
    if (chord.slotIndex < 1 || chord.slotIndex > 7) {
      errors.push(`Slot ${chord.slotIndex} is outside the 1-7 slot range.`);
    }

    errors.push(...validateChordNotes(chord.notes));
  }

  return errors;
}

export function createDefaultPack(): ChordPack {
  return {
    packName: "Untitled Pack",
    authorName: "Anonymous",
    tags: [],
    key: "C",
    trackSoundName: "Unknown sound",
    chords: [
      { slotIndex: 1, notes: [60, 64, 67], displayName: "C" },
      { slotIndex: 2, notes: [62, 65, 69], displayName: "Dm" },
      { slotIndex: 3, notes: [64, 67, 71], displayName: "Em" },
      { slotIndex: 4, notes: [65, 69, 72], displayName: "F" },
      { slotIndex: 5, notes: [67, 71, 74], displayName: "G" },
      { slotIndex: 6, notes: [69, 72, 76], displayName: "Am" },
      { slotIndex: 7, notes: [71, 74, 77], displayName: "Bdim" }
    ],
    reportedCount: 0,
    hidden: false,
    deleted: false
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/domain/music.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/music.ts src/domain/music.test.ts
git commit -m "feat: add chord pack domain model"
```

---

### Task 3: Add Local Pack Editor Reducer

**Files:**
- Create: `src/domain/packEditor.ts`
- Create: `src/domain/packEditor.test.ts`

- [ ] **Step 1: Write failing reducer tests**

Create `src/domain/packEditor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultPack } from "./music";
import { createEditorState, editorReducer } from "./packEditor";

describe("pack editor reducer", () => {
  it("selects a chord slot", () => {
    const state = createEditorState(createDefaultPack());
    const next = editorReducer(state, { type: "selectSlot", slotIndex: 4 });
    expect(next.selectedSlotIndex).toBe(4);
  });

  it("toggles notes while keeping sorted note order", () => {
    const state = createEditorState(createDefaultPack());
    const withoutC = editorReducer(state, { type: "toggleNote", note: 60 });
    expect(withoutC.pack.chords[0].notes).toEqual([64, 67]);
    const withHighC = editorReducer(withoutC, { type: "toggleNote", note: 72 });
    expect(withHighC.pack.chords[0].notes).toEqual([64, 67, 72]);
  });

  it("does not allow more than four notes", () => {
    const state = createEditorState(createDefaultPack());
    const withFourth = editorReducer(state, { type: "toggleNote", note: 72 });
    const blockedFifth = editorReducer(withFourth, { type: "toggleNote", note: 76 });
    expect(blockedFifth.pack.chords[0].notes).toEqual([60, 64, 67, 72]);
    expect(blockedFifth.message).toBe("A SEQTRAK chord can contain up to four notes.");
  });

  it("updates pack metadata", () => {
    const state = createEditorState(createDefaultPack());
    const next = editorReducer(state, {
      type: "updateMetadata",
      patch: { packName: "House Lift", authorName: "moppy", tags: ["house"], key: "G" }
    });
    expect(next.pack.packName).toBe("House Lift");
    expect(next.pack.authorName).toBe("moppy");
    expect(next.pack.tags).toEqual(["house"]);
    expect(next.pack.key).toBe("G");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/packEditor.test.ts
```

Expected: FAIL because `src/domain/packEditor.ts` does not exist.

- [ ] **Step 3: Implement reducer**

Create `src/domain/packEditor.ts`:

```ts
import type { ChordPack, KeyName } from "./music";

export interface EditorState {
  pack: ChordPack;
  selectedSlotIndex: number;
  message: string;
}

export type EditorAction =
  | { type: "selectSlot"; slotIndex: number }
  | { type: "toggleNote"; note: number }
  | {
      type: "updateMetadata";
      patch: Partial<Pick<ChordPack, "packName" | "authorName" | "tags" | "key">> & {
        key?: KeyName;
      };
    }
  | { type: "replaceSelectedChord"; notes: number[]; displayName: string };

export function createEditorState(pack: ChordPack): EditorState {
  return {
    pack,
    selectedSlotIndex: 1,
    message: ""
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "selectSlot":
      return { ...state, selectedSlotIndex: action.slotIndex, message: "" };
    case "toggleNote":
      return toggleNote(state, action.note);
    case "updateMetadata":
      return {
        ...state,
        pack: { ...state.pack, ...action.patch },
        message: ""
      };
    case "replaceSelectedChord":
      return {
        ...state,
        pack: updateSelectedChord(state, action.notes, action.displayName),
        message: ""
      };
  }
}

function toggleNote(state: EditorState, note: number): EditorState {
  const selected = state.pack.chords[state.selectedSlotIndex - 1];
  const hasNote = selected.notes.includes(note);
  const nextNotes = hasNote
    ? selected.notes.filter((candidate) => candidate !== note)
    : [...selected.notes, note].sort((a, b) => a - b);

  if (!hasNote && selected.notes.length >= 4) {
    return {
      ...state,
      message: "A SEQTRAK chord can contain up to four notes."
    };
  }

  if (nextNotes.length === 0) {
    return {
      ...state,
      message: "A SEQTRAK chord must contain at least one note."
    };
  }

  return {
    ...state,
    pack: updateSelectedChord(state, nextNotes, selected.displayName),
    message: ""
  };
}

function updateSelectedChord(state: EditorState, notes: number[], displayName: string): ChordPack {
  return {
    ...state.pack,
    chords: state.pack.chords.map((chord) =>
      chord.slotIndex === state.selectedSlotIndex ? { ...chord, notes, displayName } : chord
    )
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/domain/packEditor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/packEditor.ts src/domain/packEditor.test.ts
git commit -m "feat: add local pack editor reducer"
```

---

### Task 4: Add Rule-Based Recommendations

**Files:**
- Create: `src/domain/recommendations.ts`
- Create: `src/domain/recommendations.test.ts`

- [ ] **Step 1: Write failing recommendation tests**

Create `src/domain/recommendations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRecommendedChordNames, getVoicingVariations } from "./recommendations";

describe("recommendations", () => {
  it("returns key-relative next chord names", () => {
    const names = getRecommendedChordNames("C", "Cmaj7").map((item) => item.name);
    expect(names).toEqual(["Dm7", "G7", "Am7", "Fmaj7", "Em7", "A7"]);
  });

  it("transposes recommendations by key", () => {
    const names = getRecommendedChordNames("G", "Gmaj7").map((item) => item.name);
    expect(names).toEqual(["Am7", "D7", "Em7", "Cmaj7", "Bm7", "E7"]);
  });

  it("creates four voicing variations with one to four notes", () => {
    const variations = getVoicingVariations("C", "Dm7");
    expect(variations).toHaveLength(4);
    expect(variations[0].notes).toEqual([62, 65, 69, 72]);
    expect(variations.every((variation) => variation.notes.length >= 1)).toBe(true);
    expect(variations.every((variation) => variation.notes.length <= 4)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/recommendations.test.ts
```

Expected: FAIL because recommendation functions do not exist.

- [ ] **Step 3: Implement recommendations**

Create `src/domain/recommendations.ts`:

```ts
import { chromaticKeys, type KeyName } from "./music";

export interface RecommendedChordName {
  name: string;
  reason: string;
}

export interface VoicingVariation {
  variation: number;
  label: string;
  notes: number[];
}

const majorScaleSemitones = [0, 2, 4, 5, 7, 9, 11];
const recommendationDegrees = [
  { degree: 2, suffix: "m7", reason: "Predominant movement" },
  { degree: 5, suffix: "7", reason: "Dominant movement" },
  { degree: 6, suffix: "m7", reason: "Relative minor color" },
  { degree: 4, suffix: "maj7", reason: "Subdominant lift" },
  { degree: 3, suffix: "m7", reason: "Soft mediant motion" },
  { degree: 6, suffix: "7", reason: "Secondary dominant color" }
];

export function getRecommendedChordNames(
  key: KeyName,
  currentChordName: string
): RecommendedChordName[] {
  void currentChordName;
  return recommendationDegrees.map((candidate) => ({
    name: `${degreeName(key, candidate.degree)}${candidate.suffix}`,
    reason: candidate.reason
  }));
}

export function getVoicingVariations(key: KeyName, chordName: string): VoicingVariation[] {
  const root = chordRootMidi(key, chordName);
  const quality = chordQuality(chordName);
  const tones = quality === "dominant" ? [0, 4, 7, 10] : quality === "minor" ? [0, 3, 7, 10] : [0, 4, 7, 11];

  return [
    { variation: 1, label: "close", notes: tones.map((interval) => root + interval) },
    { variation: 2, label: "smooth", notes: [root + tones[0], root + tones[2], root + tones[3], root + 12 + tones[1]] },
    { variation: 3, label: "wide", notes: [root - 12 + tones[0], root + tones[2], root + tones[3], root + 12 + tones[1]] },
    { variation: 4, label: "high", notes: tones.map((interval) => root + 12 + interval) }
  ];
}

function degreeName(key: KeyName, degree: number): KeyName {
  const rootIndex = chromaticKeys.indexOf(key);
  const semitone = majorScaleSemitones[degree - 1];
  return chromaticKeys[(rootIndex + semitone) % chromaticKeys.length];
}

function chordRootMidi(key: KeyName, chordName: string): number {
  const rootMatch = chordName.match(/^[A-G]#?/);
  const rootName = (rootMatch?.[0] ?? key) as KeyName;
  const rootIndex = chromaticKeys.indexOf(rootName);
  return 60 + rootIndex;
}

function chordQuality(chordName: string): "major" | "minor" | "dominant" {
  if (chordName.includes("m") && !chordName.includes("maj")) {
    return "minor";
  }
  if (chordName.includes("7") && !chordName.includes("maj")) {
    return "dominant";
  }
  return "major";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/domain/recommendations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/recommendations.ts src/domain/recommendations.test.ts
git commit -m "feat: add rule based recommendations"
```

---

### Task 5: Add Web Audio Preview Interface

**Files:**
- Create: `src/audio/previewEngine.ts`
- Create: `src/audio/previewEngine.test.ts`

- [ ] **Step 1: Write failing preview tests**

Create `src/audio/previewEngine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { NullPreviewEngine, noteToFrequency } from "./previewEngine";

describe("preview engine", () => {
  it("converts MIDI notes to equal-tempered frequencies", () => {
    expect(noteToFrequency(69)).toBeCloseTo(440);
    expect(noteToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it("provides a null engine for tests and unsupported audio contexts", async () => {
    const engine = new NullPreviewEngine();
    const spy = vi.spyOn(engine, "playChord");
    await engine.playChord([60, 64, 67]);
    expect(spy).toHaveBeenCalledWith([60, 64, 67]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/audio/previewEngine.test.ts
```

Expected: FAIL because `previewEngine.ts` does not exist.

- [ ] **Step 3: Implement preview engine**

Create `src/audio/previewEngine.ts`:

```ts
export interface PreviewEngine {
  playNote(note: number): Promise<void>;
  playChord(notes: number[]): Promise<void>;
}

export function noteToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export class NullPreviewEngine implements PreviewEngine {
  async playNote(_note: number): Promise<void> {
    return Promise.resolve();
  }

  async playChord(_notes: number[]): Promise<void> {
    return Promise.resolve();
  }
}

export class WebAudioPreviewEngine implements PreviewEngine {
  private context: AudioContext;

  constructor(context = new AudioContext()) {
    this.context = context;
  }

  async playNote(note: number): Promise<void> {
    await this.playChord([note]);
  }

  async playChord(notes: number[]): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    const now = this.context.currentTime;
    const duration = 0.7;

    for (const note of notes) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = noteToFrequency(note);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/audio/previewEngine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/previewEngine.ts src/audio/previewEngine.test.ts
git commit -m "feat: add web audio preview engine"
```

---

### Task 6: Add Editor Components

**Files:**
- Create: `src/components/ChordGrid.tsx`
- Create: `src/components/Keyboard88.tsx`
- Create: `src/components/MetadataPanel.tsx`
- Create: `src/components/RecommendationPanel.tsx`
- Create: `src/components/ChordGrid.test.tsx`
- Create: `src/components/Keyboard88.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/ChordGrid.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { renderApp } from "../test/render";
import { ChordGrid } from "./ChordGrid";

describe("ChordGrid", () => {
  it("renders space plus seven slots and selects a slot", async () => {
    const onSelect = vi.fn();
    renderApp(
      <ChordGrid pack={createDefaultPack()} selectedSlotIndex={1} onSelectSlot={onSelect} />
    );
    expect(screen.getByText("Space")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Slot 4 F" }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});
```

Create `src/components/Keyboard88.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import { Keyboard88 } from "./Keyboard88";

describe("Keyboard88", () => {
  it("renders 88 piano keys and toggles a note", async () => {
    const onToggle = vi.fn();
    const onPreview = vi.fn();
    renderApp(<Keyboard88 activeNotes={[60, 64, 67]} onToggleNote={onToggle} onPreviewNote={onPreview} />);
    expect(screen.getAllByRole("button")).toHaveLength(88);
    await userEvent.click(screen.getByRole("button", { name: "C4 selected" }));
    expect(onPreview).toHaveBeenCalledWith(60);
    expect(onToggle).toHaveBeenCalledWith(60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/components/ChordGrid.test.tsx src/components/Keyboard88.test.tsx
```

Expected: FAIL because component files do not exist.

- [ ] **Step 3: Implement components**

Create `src/components/ChordGrid.tsx`:

```tsx
import type { ChordPack } from "../domain/music";

interface ChordGridProps {
  pack: ChordPack;
  selectedSlotIndex: number;
  onSelectSlot: (slotIndex: number) => void;
}

export function ChordGrid({ pack, selectedSlotIndex, onSelectSlot }: ChordGridProps) {
  return (
    <div className="chord-grid" aria-label="Chord slots">
      <div className="slot-card space-slot">Space</div>
      {pack.chords.map((chord) => (
        <button
          className={chord.slotIndex === selectedSlotIndex ? "slot-card selected" : "slot-card"}
          key={chord.slotIndex}
          onClick={() => onSelectSlot(chord.slotIndex)}
          type="button"
          aria-label={`Slot ${chord.slotIndex} ${chord.displayName}`}
        >
          <strong>{chord.slotIndex}</strong>
          <span>{chord.displayName}</span>
        </button>
      ))}
    </div>
  );
}
```

Create `src/components/Keyboard88.tsx`:

```tsx
import { isBlackKey, midiNoteName, MAX_88_KEY_MIDI_NOTE, MIN_88_KEY_MIDI_NOTE } from "../domain/music";

interface Keyboard88Props {
  activeNotes: number[];
  candidateNotes?: number[];
  onToggleNote: (note: number) => void;
  onPreviewNote: (note: number) => void;
}

export function Keyboard88({
  activeNotes,
  candidateNotes = [],
  onToggleNote,
  onPreviewNote
}: Keyboard88Props) {
  const notes = Array.from(
    { length: MAX_88_KEY_MIDI_NOTE - MIN_88_KEY_MIDI_NOTE + 1 },
    (_, index) => MIN_88_KEY_MIDI_NOTE + index
  );

  return (
    <div className="keyboard-wrap" aria-label="88-key piano keyboard">
      <div className="keyboard">
        {notes.map((note) => {
          const selected = activeNotes.includes(note);
          const candidate = candidateNotes.includes(note);
          const label = `${midiNoteName(note)}${selected ? " selected" : candidate ? " candidate" : ""}`;
          return (
            <button
              aria-label={label}
              className={[
                "piano-key",
                isBlackKey(note) ? "black" : "white",
                selected ? "active" : "",
                candidate ? "candidate" : ""
              ].join(" ")}
              key={note}
              onClick={() => {
                onPreviewNote(note);
                onToggleNote(note);
              }}
              title={midiNoteName(note)}
              type="button"
            />
          );
        })}
      </div>
    </div>
  );
}
```

Create `src/components/MetadataPanel.tsx`:

```tsx
import { chromaticKeys, type ChordPack, type KeyName } from "../domain/music";

interface MetadataPanelProps {
  pack: ChordPack;
  onChange: (patch: Partial<Pick<ChordPack, "packName" | "authorName" | "tags" | "key">>) => void;
}

export function MetadataPanel({ pack, onChange }: MetadataPanelProps) {
  return (
    <section className="panel metadata-panel" aria-label="Pack metadata">
      <label>
        Track sound
        <input value={pack.trackSoundName} readOnly />
      </label>
      <label>
        Pack name
        <input value={pack.packName} onChange={(event) => onChange({ packName: event.target.value })} />
      </label>
      <label>
        Author
        <input value={pack.authorName} onChange={(event) => onChange({ authorName: event.target.value })} />
      </label>
      <label>
        Tags
        <input
          value={pack.tags.join(", ")}
          onChange={(event) =>
            onChange({
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
            })
          }
        />
      </label>
      <label>
        Pack key
        <select value={pack.key} onChange={(event) => onChange({ key: event.target.value as KeyName })}>
          {chromaticKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
```

Create `src/components/RecommendationPanel.tsx`:

```tsx
import { useMemo, useState } from "react";
import { chromaticKeys, type KeyName } from "../domain/music";
import {
  getRecommendedChordNames,
  getVoicingVariations,
  type VoicingVariation
} from "../domain/recommendations";

interface RecommendationPanelProps {
  packKey: KeyName;
  currentChordName: string;
  onPreview: (notes: number[]) => void;
  onApply: (variation: VoicingVariation, chordName: string) => void;
}

export function RecommendationPanel({
  packKey,
  currentChordName,
  onPreview,
  onApply
}: RecommendationPanelProps) {
  const [selectedKey, setSelectedKey] = useState<KeyName | "pack">("pack");
  const effectiveKey = selectedKey === "pack" ? packKey : selectedKey;
  const chordNames = useMemo(
    () => getRecommendedChordNames(effectiveKey, currentChordName),
    [effectiveKey, currentChordName]
  );
  const [selectedChordName, setSelectedChordName] = useState(chordNames[0]?.name ?? "Dm7");
  const variations = getVoicingVariations(effectiveKey, selectedChordName);
  const overrideKeys = chromaticKeys.filter((key) => key !== packKey);

  return (
    <section className="panel recommendation-panel" aria-label="Recommendations">
      <div className="recommendation-header">
        <label>
          Recommendation key
          <select
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value as KeyName | "pack")}
          >
            <option value="pack">Pack Key ({packKey})</option>
            {overrideKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chip-row" aria-label="Recommended chord names">
        {chordNames.map((chord) => (
          <button
            className={chord.name === selectedChordName ? "chip selected" : "chip"}
            key={`${chord.name}-${chord.reason}`}
            onClick={() => setSelectedChordName(chord.name)}
            type="button"
          >
            <strong>{chord.name}</strong>
            <span>{chord.reason}</span>
          </button>
        ))}
      </div>

      <div className="variation-row" aria-label="Voicing variations">
        {variations.map((variation) => (
          <button
            className="variation"
            key={variation.variation}
            onClick={() => {
              onPreview(variation.notes);
              onApply(variation, selectedChordName);
            }}
            type="button"
          >
            <strong>{variation.variation}</strong>
            <span>{variation.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npm test -- src/components/ChordGrid.test.tsx src/components/Keyboard88.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/test/render.tsx
git commit -m "feat: add editor components"
```

---

### Task 7: Compose App and Styling

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write failing app test**

Create `src/App.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { renderApp } from "./test/render";

describe("App", () => {
  it("renders the local editor and changes selected chord notes", async () => {
    renderApp(<App />);
    expect(screen.getByRole("heading", { name: "Chord Manager" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
    expect(screen.getByLabelText("Chord slots")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
    await userEvent.click(screen.getByRole("button", { name: "C4" }));
    expect(screen.getByRole("button", { name: "C4 selected" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because `App.tsx` still renders only the scaffold placeholder.

- [ ] **Step 3: Compose app**

Replace `src/App.tsx` with:

```tsx
import { useMemo, useReducer } from "react";
import { NullPreviewEngine, WebAudioPreviewEngine } from "./audio/previewEngine";
import { ChordGrid } from "./components/ChordGrid";
import { Keyboard88 } from "./components/Keyboard88";
import { MetadataPanel } from "./components/MetadataPanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { createDefaultPack } from "./domain/music";
import { createEditorState, editorReducer } from "./domain/packEditor";

const canUseAudioContext = typeof window !== "undefined" && "AudioContext" in window;

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, createEditorState(createDefaultPack()));
  const selectedChord = state.pack.chords[state.selectedSlotIndex - 1];
  const previewEngine = useMemo(
    () => (canUseAudioContext ? new WebAudioPreviewEngine() : new NullPreviewEngine()),
    []
  );

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">SEQTRAK</p>
          <h1>Chord Manager</h1>
        </div>
        <div className="top-actions">
          <button type="button" disabled>
            Connect SEQTRAK
          </button>
          <button type="button" disabled>
            Read
          </button>
          <button type="button" disabled>
            Write
          </button>
          <div className="device-status">Browser-only mode</div>
        </div>
      </header>

      <section className="workspace">
        <div className="upper-editor">
          <MetadataPanel
            pack={state.pack}
            onChange={(patch) => dispatch({ type: "updateMetadata", patch })}
          />
          <ChordGrid
            pack={state.pack}
            selectedSlotIndex={state.selectedSlotIndex}
            onSelectSlot={(slotIndex) => dispatch({ type: "selectSlot", slotIndex })}
          />
        </div>

        {state.message ? <p className="status-message">{state.message}</p> : null}

        <Keyboard88
          activeNotes={selectedChord.notes}
          onPreviewNote={(note) => void previewEngine.playNote(note)}
          onToggleNote={(note) => dispatch({ type: "toggleNote", note })}
        />

        <RecommendationPanel
          packKey={state.pack.key}
          currentChordName={selectedChord.displayName}
          onPreview={(notes) => void previewEngine.playChord(notes)}
          onApply={(variation, chordName) =>
            dispatch({
              type: "replaceSelectedChord",
              notes: variation.notes,
              displayName: chordName
            })
          }
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Expand CSS**

Append to `src/styles.css`:

```css
.top-actions {
  align-items: center;
  display: flex;
  gap: 8px;
}

.top-actions button,
.chip,
.variation,
.slot-card {
  border: 1px solid #c9d0dc;
  border-radius: 6px;
  background: #ffffff;
  color: #1b1c1f;
  cursor: pointer;
}

.top-actions button:disabled {
  color: #7a8291;
  cursor: not-allowed;
}

.upper-editor {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(260px, 340px) 1fr;
  margin-bottom: 16px;
}

.panel {
  background: #ffffff;
  border: 1px solid #d9dde5;
  border-radius: 8px;
  padding: 14px;
}

.metadata-panel {
  display: grid;
  gap: 10px;
}

.metadata-panel label,
.recommendation-header label {
  color: #424956;
  display: grid;
  font-size: 13px;
  gap: 4px;
}

.metadata-panel input,
.metadata-panel select,
.recommendation-header select {
  border: 1px solid #c9d0dc;
  border-radius: 6px;
  padding: 8px;
}

.chord-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(92px, 1fr));
}

.slot-card {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 5px;
  height: 78px;
  justify-content: center;
}

.space-slot {
  background: #edf0f5;
  color: #707888;
  cursor: default;
}

.slot-card.selected,
.chip.selected {
  border-color: #3563d8;
  box-shadow: 0 0 0 2px rgba(53, 99, 216, 0.15);
}

.keyboard-wrap {
  background: #ffffff;
  border: 1px solid #d9dde5;
  border-radius: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding: 14px;
}

.keyboard {
  display: grid;
  grid-template-columns: repeat(88, 24px);
  height: 144px;
  min-width: 2112px;
}

.piano-key {
  border: 1px solid #b7bfcc;
  border-radius: 0 0 4px 4px;
  min-width: 24px;
}

.piano-key.white {
  background: #ffffff;
  height: 144px;
}

.piano-key.black {
  background: #20242c;
  height: 92px;
}

.piano-key.active {
  background: #5d8cff;
}

.piano-key.candidate {
  outline: 3px solid #36a66a;
  outline-offset: -3px;
}

.recommendation-panel {
  display: grid;
  gap: 12px;
}

.chip-row,
.variation-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.chip,
.variation {
  align-items: center;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 4px;
  min-width: 112px;
  padding: 10px;
}

.chip span,
.variation span {
  color: #626b7a;
  font-size: 12px;
}

.status-message {
  background: #fff7dc;
  border: 1px solid #ecd37b;
  border-radius: 6px;
  margin: 0 0 14px;
  padding: 10px;
}

@media (max-width: 860px) {
  .top-bar,
  .top-actions,
  .upper-editor {
    align-items: stretch;
    display: grid;
  }

  .upper-editor {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run app test and full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Build app**

Run:

```bash
npm run build
```

Expected: PASS and `dist/` is generated.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: compose local chord editor"
```

---

### Task 8: Manual Browser Verification

**Files:**
- No source files expected.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 2: Verify desktop layout**

Open the local URL. Confirm:

- Header shows `SEQTRAK` and `Chord Manager`.
- Device actions are visible and disabled.
- Metadata panel is left of the 2 by 4 chord grid.
- Chord grid shows `Space 1 2 3 / 4 5 6 7`.
- 88-key keyboard scrolls horizontally.
- Recommendation area shows key selector, chord names, and four voicing variations.

- [ ] **Step 3: Verify editor behavior**

In the browser:

- Click slot `2`.
- Click keys on the keyboard and confirm selected notes change color.
- Add a fourth note, then try a fifth note and confirm the warning message appears.
- Change Pack name, Author, Tags, and Pack key.
- Select a recommended chord and voicing variation and confirm the selected slot changes.

- [ ] **Step 4: Commit verification note if source changed**

If any visual or behavior fixes were made during verification:

```bash
git add src
git commit -m "fix: polish local editor verification issues"
```

If no source changed, do not create an empty commit.

---

## Self-Review Notes

Spec coverage in Phase 1:

- Covered: domain pack shape, seven slots, 1-4 notes, metadata editing, `Space 1 2 3 / 4 5 6 7` layout, 88-key keyboard editing, Web Audio preview interface, recommendation UI shape, Pack Key plus 11-key override, voicing variations, local browser-only editing state.
- Deferred to later explicit plans: Web MIDI/SysEx, Supabase posting and browsing, anonymous delete token persistence, reporting, admin hiding, real SEQTRAK write confirmation, post-write verification.

No placeholder work is intentionally left in Phase 1. Disabled device buttons are visible affordances for later phases, not partially implemented behavior.
