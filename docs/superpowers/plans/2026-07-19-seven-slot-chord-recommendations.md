# Seven-Slot Chord Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build seven source-specific recommendation tabs that generate twelve deterministic next-chord choices, preview four valid voicings, and explicitly apply one choice to the independently selected Chord Grid slot.

**Architecture:** Music theory is split into canonical chord symbols, note-based source inference, named recommendation rules, and range-safe voicing generation. A new seven-slot panel owns transient tab/candidate/variation state, while `App` owns Web Audio preview, keyboard candidate notes, and mutation of the selected target slot.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Web Audio, existing reducer/domain model

## Global Constraints

- Expose seven recommendation source areas as tabs; source tab selection never changes the Chord Grid target.
- Produce exactly twelve unique candidates per valid source: six conventional and six chromatic.
- Initially show an interleaved three conventional plus three chromatic candidates; `More` reveals the remaining six.
- Exclude the exact canonical source chord and enharmonic duplicates.
- Use deterministic local theory rules only; no Supabase, network ranking, personalization, or randomness.
- Recommendation key is shared across all tabs and defaults to Pack Key.
- Recommendation mode is shared, defaults to Major, and is not persisted.
- Parse major/minor, maj7/m7/7, dim/dim7/m7b5, aug, sus2/sus4, maj9/m9/9/11/13, 7b9/7#9/7#11/7b13, add9, and 6/9.
- Slash bass does not affect recommendation generation.
- If the symbol is unsupported, infer from live-KEY-adjusted notes; ties prefer the lowest sounding note as root and show `Inferred as <name>`.
- Display key-aware sharp/flat spellings but simplify E#/B#/Cb/Fb to F/C/B/E.
- Tension voicings use root, third, seventh, and tension, omitting fifth; every variation has one to four valid notes.
- Candidate selection does not preview or mutate; variation selection uses existing Web Audio and keyboard candidate highlighting; explicit Apply mutates only the current Chord Grid target.
- Target-only changes preserve preview selection; source/key/mode/tab changes and Apply clear it.
- A live SEQTRAK KEY change clears preview selection and candidate notes before recomputing source inference and voicing range.
- Recommendation panel unmount clears App-level candidate notes so returning from Shared Packs cannot restore stale highlights.
- Do not change `ChordPack`, shared payloads, DB schema, SysEx, MIDI connection behavior, or add SEQTRAK audition.

---

### Task 1: Canonical Chord Symbols and Readable Spelling

**Files:**
- Create: `src/domain/chordSymbols.ts`
- Create: `src/domain/chordSymbols.test.ts`

**Interfaces:**
- Produces: `ChordQuality`, `CanonicalChord`, `RecommendationMode`, `SpellingHint`, `CHORD_INTERVALS`, `parseChordSymbol`, `formatChordSymbol`, `canonicalChordKey`.
- Consumed by: Tasks 2–5.

- [ ] **Step 1: Write failing parser and formatter tests**

Create `src/domain/chordSymbols.test.ts` with these public-behavior assertions:

```ts
import { describe, expect, it } from "vitest";
import {
  canonicalChordKey,
  formatChordSymbol,
  parseChordSymbol
} from "./chordSymbols";

describe("chord symbols", () => {
  it.each([
    ["C", { root: 0, quality: "major" }],
    ["Bbm7", { root: 10, quality: "m7" }],
    ["F#dim7", { root: 6, quality: "dim7" }],
    ["Gø7", { root: 7, quality: "m7b5" }],
    ["D♭7♯11", { root: 1, quality: "7#11" }],
    ["Am/C", { root: 9, quality: "minor" }],
    ["E6/9", { root: 4, quality: "6/9" }]
  ])("parses %s", (symbol, expected) => {
    expect(parseChordSymbol(symbol)).toEqual(expected);
  });

  it("returns null for unsupported text", () => {
    expect(parseChordSymbol("Mystery chord")).toBeNull();
  });

  it("formats canonical pitch classes with readable contextual spelling", () => {
    expect(formatChordSymbol({ root: 10, quality: "7" }, 5, "major", "key")).toBe("Bb7");
    expect(formatChordSymbol({ root: 3, quality: "maj9" }, 0, "major", "flat")).toBe("Ebmaj9");
    expect(formatChordSymbol({ root: 6, quality: "7#11" }, 7, "major", "sharp")).toBe("F#7#11");
  });

  it("deduplicates enharmonic spellings canonically", () => {
    expect(canonicalChordKey(parseChordSymbol("C#7")!))
      .toBe(canonicalChordKey(parseChordSymbol("Db7")!));
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run `npm test -- src/domain/chordSymbols.test.ts`.

Expected: FAIL because `chordSymbols.ts` does not exist.

- [ ] **Step 3: Implement the canonical vocabulary**

Create `src/domain/chordSymbols.ts` with these exact exports and interval templates:

```ts
export type ChordQuality =
  | "major" | "minor" | "dim" | "aug" | "sus2" | "sus4"
  | "maj7" | "m7" | "7" | "dim7" | "m7b5"
  | "maj9" | "m9" | "9" | "11" | "13"
  | "7b9" | "7#9" | "7#11" | "7b13" | "add9" | "6/9";

export type RecommendationMode = "major" | "minor";
export type SpellingHint = "key" | "flat" | "sharp";

export interface CanonicalChord {
  root: number;
  quality: ChordQuality;
}

export const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], maj9: [0, 4, 11, 14], m9: [0, 3, 10, 14],
  "9": [0, 4, 10, 14], "11": [0, 4, 10, 17], "13": [0, 4, 10, 21],
  "7b9": [0, 4, 10, 13], "7#9": [0, 4, 10, 15],
  "7#11": [0, 4, 10, 18], "7b13": [0, 4, 10, 20],
  add9: [0, 4, 7, 14], "6/9": [0, 4, 9, 14]
};
```

Normalize unicode accidentals, `ø7`, `°7`, `°`, `min`, and bare `sus`; strip a slash-bass only after recognizing `6/9`. Match suffixes longest-first so `maj9` is not parsed as `major` plus trailing text. Return `null` if any non-slash suffix remains. Use pitch-class root aliases matching the existing app.

For formatting, use sharp names `C C# D D# E F F# G G# A A# B` and flat names `C Db D Eb E F Gb G Ab A Bb B`. `flat` and `sharp` force those tables; `key` prefers flats for F/Bb/Eb/Ab key roots and sharps otherwise. Use this explicit suffix map so internal names never leak into display:

```ts
const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "", minor: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
  maj7: "maj7", m7: "m7", "7": "7", dim7: "dim7", m7b5: "m7b5",
  maj9: "maj9", m9: "m9", "9": "9", "11": "11", "13": "13",
  "7b9": "7b9", "7#9": "7#9", "7#11": "7#11", "7b13": "7b13",
  add9: "add9", "6/9": "6/9"
};
```

These root tables inherently avoid E#/B#/Cb/Fb.

- [ ] **Step 4: Verify GREEN and regression scope**

Run:

```bash
npm test -- src/domain/chordSymbols.test.ts src/domain/recommendations.test.ts
git diff --check
```

Expected: new symbol tests and existing recommendation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chordSymbols.ts src/domain/chordSymbols.test.ts
git commit -m "feat: add canonical chord symbols"
```

---

### Task 2: Live-KEY-Aware Source Chord Inference

**Files:**
- Create: `src/domain/chordInference.ts`
- Create: `src/domain/chordInference.test.ts`

**Interfaces:**
- Consumes: Task 1 `CanonicalChord`, `ChordQuality`, `CHORD_INTERVALS`, `parseChordSymbol`, `formatChordSymbol`.
- Produces: `ResolvedSourceChord` and `resolveSourceChord(input)`.

- [ ] **Step 1: Write failing resolution tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveSourceChord } from "./chordInference";

describe("source chord resolution", () => {
  it("trusts a supported chord symbol", () => {
    expect(resolveSourceChord({
      displayName: "Am/C", relativeNotes: [60, 64, 69], keyOffset: 0,
      keyRoot: 0, mode: "major"
    })).toMatchObject({ chord: { root: 9, quality: "minor" }, inferred: false });
  });

  it("infers from sounding notes after applying live KEY", () => {
    expect(resolveSourceChord({
      displayName: "Unknown", relativeNotes: [56, 59, 63], keyOffset: 1,
      keyRoot: 0, mode: "major"
    })).toMatchObject({ chord: { root: 9, quality: "minor" }, inferred: true, name: "Am" });
  });

  it("uses the lowest sounding note as the root tie-breaker", () => {
    expect(resolveSourceChord({
      displayName: "Unknown", relativeNotes: [60, 64], keyOffset: 0,
      keyRoot: 0, mode: "major"
    })!.chord.root).toBe(0);
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/domain/chordInference.test.ts`.

Expected: FAIL because `resolveSourceChord` does not exist.

- [ ] **Step 3: Implement deterministic nearest-template inference**

Use this public interface:

```ts
export interface ResolveSourceChordInput {
  displayName: string;
  relativeNotes: number[];
  keyOffset: number;
  keyRoot: number;
  mode: RecommendationMode;
}

export interface ResolvedSourceChord {
  chord: CanonicalChord;
  name: string;
  inferred: boolean;
}

export function resolveSourceChord(input: ResolveSourceChordInput): ResolvedSourceChord | null;
```

Return parsed symbols immediately. Otherwise add `keyOffset` to every finite integer note, compare unique pitch classes against all twelve roots and every `CHORD_INTERVALS` template, and sort candidates lexicographically by:

```ts
type InferenceScore = readonly [
  symmetricDifference: number,
  pitchDistance: number,
  bassRootPenalty: 0 | 1,
  qualityComplexity: number,
  root: number
];
```

`pitchDistance` is the sum, for each sounding pitch class, of its shortest circular distance to any template pitch class. Quality complexity follows the `ChordQuality` declaration order from Task 1. Return `null` only for an empty list after filtering non-finite/non-integer notes. Format inferred names through Task 1.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- src/domain/chordInference.test.ts src/domain/chordSymbols.test.ts
git diff --check
```

Expected: all source-resolution and symbol tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chordInference.ts src/domain/chordInference.test.ts
git commit -m "feat: infer recommendation source chords"
```

---

### Task 3: Balanced Hybrid Recommendation Engine

**Files:**
- Modify: `src/domain/recommendations.ts`
- Modify: `src/domain/recommendations.test.ts`

**Interfaces:**
- Consumes: Task 1 canonical symbols and Task 2 `resolveSourceChord`.
- Produces: `RecommendationCategory`, `RecommendationRuleId`, `ChordRecommendation`, `ChordRecommendationSet`, `getChordRecommendations(input)`.
- Preserves until Task 6: legacy `getRecommendedChordNames` and `getVoicingVariations` exports so the old panel remains operational.

- [ ] **Step 1: Add failing recommendation invariant tests**

Add tests using this input shape:

```ts
const input = {
  keyRoot: 0,
  mode: "major" as const,
  sourceDisplayName: "Cmaj7",
  sourceRelativeNotes: [60, 64, 67, 71],
  keyOffset: 0
};

it("returns balanced unique source-sensitive recommendations", () => {
  const c = getChordRecommendations(input);
  const g = getChordRecommendations({ ...input, sourceDisplayName: "G7", sourceRelativeNotes: [67, 71, 74, 77] });
  expect(c.candidates).toHaveLength(12);
  expect(new Set(c.candidates.map((item) => canonicalChordKey(item.chord))).size).toBe(12);
  expect(c.candidates.slice(0, 6).filter((item) => item.category === "conventional")).toHaveLength(3);
  expect(c.candidates.slice(0, 6).filter((item) => item.category === "chromatic")).toHaveLength(3);
  expect(c.candidates.map((item) => item.name)).not.toEqual(g.candidates.map((item) => item.name));
  expect(c.candidates.some((item) => item.name === "Cmaj7")).toBe(false);
});

it("changes deterministically with key and mode", () => {
  const major = getChordRecommendations(input).candidates.map((item) => item.name);
  const minor = getChordRecommendations({ ...input, mode: "minor" }).candidates.map((item) => item.name);
  expect(minor).not.toEqual(major);
  expect(getChordRecommendations(input).candidates.map((item) => item.name)).toEqual(major);
});

it("covers named conventional and chromatic reasons across fixtures", () => {
  const fixtures = ["Cmaj7", "Dm7", "G7", "Abmaj7", "F#dim7"];
  const ids = new Set(fixtures.flatMap((sourceDisplayName) =>
    getChordRecommendations({ ...input, sourceDisplayName }).candidates.map((item) => item.ruleId)
  ));
  for (const id of [
    "functional", "circle-fifths", "dominant-resolution", "predominant-dominant",
    "deceptive", "relative", "stepwise", "common-tone", "secondary-dominant",
    "tritone-substitution", "modal-interchange", "chromatic-mediant", "backdoor",
    "neapolitan", "common-tone-diminished", "parallel-mode", "altered-dominant",
    "chromatic-semitone"
  ]) {
    expect(ids).toContain(id);
  }
});
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/domain/recommendations.test.ts`.

Expected: FAIL because the new API and balanced candidate metadata do not exist.

- [ ] **Step 3: Add exact public types and named rule definitions**

```ts
export type RecommendationCategory = "conventional" | "chromatic";
export type RecommendationRuleId =
  | "functional" | "circle-fifths" | "dominant-resolution" | "predominant-dominant"
  | "deceptive" | "relative" | "stepwise" | "common-tone"
  | "secondary-dominant" | "tritone-substitution" | "modal-interchange"
  | "chromatic-mediant" | "backdoor" | "neapolitan" | "common-tone-diminished"
  | "parallel-mode" | "altered-dominant" | "chromatic-semitone"
  | "functional-fallback" | "chromatic-fallback";

export interface ChordRecommendation {
  chord: CanonicalChord;
  name: string;
  reason: string;
  category: RecommendationCategory;
  ruleId: RecommendationRuleId;
}

export interface ChordRecommendationSet {
  source: ResolvedSourceChord | null;
  candidates: ChordRecommendation[];
}

export interface ChordRecommendationInput {
  keyRoot: number;
  mode: RecommendationMode;
  sourceDisplayName: string;
  sourceRelativeNotes: number[];
  keyOffset: number;
}
```

Represent each rule as a pure definition with category, reason, base priority, spelling hint, and a generator receiving source/key/mode. Implement every family named in the design. Use scale-quality tables for Major `[major, minor, minor, major, major, minor, dim]` and Minor `[minor, dim, major, minor, minor, major, major]`; dominant-producing rules explicitly use `7`, `9`, `13`, or the named altered quality.

- [ ] **Step 4: Implement ranking, balancing, and fallbacks**

Canonicalize and exclude the source before scoring. Score each candidate with a tuple ordered by contextual rule priority, negative shared-tone count, aggregate circular voice-leading distance, root distance, rule order, root, and quality order. Deduplicate by `canonicalChordKey`, retaining the better score.

Sort conventional and chromatic pools independently. If either pool has fewer than six items, enumerate all canonical roots and qualities, classify them into that pool, assign `functional-fallback` or `chromatic-fallback`, and fill by the same voice-leading tuple. Return this order:

```ts
[
  conventional[0], chromatic[0], conventional[1], chromatic[1],
  conventional[2], chromatic[2], conventional[3], chromatic[3],
  conventional[4], chromatic[4], conventional[5], chromatic[5]
]
```

Format names with each rule's spelling hint and fixed short reasons such as `Dominant resolution`, `Chromatic mediant`, and `Tritone substitution`. Never expose scores.

- [ ] **Step 5: Verify GREEN and legacy compatibility**

Run:

```bash
npm test -- src/domain/recommendations.test.ts src/components/RecommendationPanel.test.tsx
git diff --check
```

Expected: new engine tests and the still-legacy panel test PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/recommendations.ts src/domain/recommendations.test.ts
git commit -m "feat: generate balanced chord recommendations"
```

---

### Task 4: Quality-Aware, Range-Safe Voicing Variations

**Files:**
- Create: `src/domain/voicings.ts`
- Create: `src/domain/voicings.test.ts`

**Interfaces:**
- Consumes: `CanonicalChord`, `CHORD_INTERVALS`, SEQTRAK and 88-key range constants.
- Produces: `VoicingVariation` and `getChordVoicingVariations(chord, keyOffset)`.

- [ ] **Step 1: Write failing shell and range tests**

```ts
import { describe, expect, it } from "vitest";
import { getChordVoicingVariations } from "./voicings";

describe("chord voicings", () => {
  it.each([
    ["maj9", [0, 4, 11, 2]], ["m9", [0, 3, 10, 2]],
    ["7b9", [0, 4, 10, 1]], ["7#11", [0, 4, 10, 6]],
    ["13", [0, 4, 10, 9]]
  ] as const)("uses a four-note shell for %s", (quality, expectedPitchClasses) => {
    const close = getChordVoicingVariations({ root: 0, quality }, 0)[0];
    expect(close.notes.map((note) => note % 12)).toEqual(expectedPitchClasses);
    expect(close.notes).toHaveLength(4);
  });

  it("returns four distinct in-range variations at KEY 11", () => {
    const variations = getChordVoicingVariations({ root: 11, quality: "7b13" }, 11);
    expect(variations).toHaveLength(4);
    expect(new Set(variations.map((item) => item.notes.join(","))).size).toBe(4);
    for (const variation of variations) {
      expect(variation.notes.every((note) => Number.isInteger(note) && note >= 47 && note <= 107)).toBe(true);
      expect(new Set(variation.notes).size).toBe(variation.notes.length);
    }
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/domain/voicings.test.ts`.

Expected: FAIL because `voicings.ts` does not exist.

- [ ] **Step 3: Implement shell construction and four placements**

```ts
export interface VoicingVariation {
  variation: number;
  label: "close" | "smooth" | "wide" | "high";
  notes: number[];
}

export function getChordVoicingVariations(
  chord: CanonicalChord,
  keyOffset: number
): VoicingVariation[];
```

Build a base voicing at MIDI `60 + chord.root`. `CHORD_INTERVALS` already contains the required four-note shells. Construct placements as: close = base; smooth = move the lowest tone up one octave; wide = move root down one octave; high = move all tones up one octave. Sort only where the label requires ascending playback, never replace pitch classes.

Fit each whole voicing by octave shifts into:

```ts
const minimum = Math.max(MIN_88_KEY_MIDI_NOTE, SEQTRAK_MIN_CHORD_NOTE + keyOffset);
const maximum = Math.min(MAX_88_KEY_MIDI_NOTE, SEQTRAK_MAX_CHORD_NOTE + keyOffset);
```

If two fitted placements collide, move an eligible non-root chord tone by one octave within bounds to retain the template and make all four variation arrays distinct. Validate `keyOffset` through the existing assertion.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- src/domain/voicings.test.ts src/audio/previewEngine.test.ts
git diff --check
```

Expected: all voicing and preview-engine tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/voicings.ts src/domain/voicings.test.ts
git commit -m "feat: add range-safe chord voicings"
```

---

### Task 5: Seven-Tab Recommendation Interaction Component

**Files:**
- Create: `src/components/SevenSlotRecommendationPanel.tsx`
- Create: `src/components/SevenSlotRecommendationPanel.test.tsx`

**Interfaces:**
- Consumes: all seven `ChordSlot`s, Pack Key, live KEY offset, target slot index, Tasks 3–4 APIs.
- Produces callbacks `onPreview`, `onCandidateNotesChange`, and explicit `onApply`.

- [ ] **Step 1: Write failing seven-tab workflow tests**

Use `createDefaultPack().chords` and this exact prop contract:

```tsx
interface SevenSlotRecommendationPanelProps {
  chords: ChordSlot[];
  packKey: KeyName;
  keyOffset: number;
  targetSlotIndex: number;
  onPreview: (notes: number[]) => void;
  onCandidateNotesChange: (notes: number[]) => void;
  onApply: (variation: VoicingVariation, chordName: string) => void;
}
```

Tests must assert:

```tsx
expect(screen.getAllByRole("tab")).toHaveLength(7);
expect(screen.getByRole("tab", { name: "Slot 1 — C" })).toHaveAttribute("aria-selected", "true");
expect(screen.getByRole("tabpanel")).toBeInTheDocument();
expect(screen.getAllByRole("button", { name: /recommendation:/i })).toHaveLength(6);
await userEvent.click(screen.getByRole("button", { name: "More recommendations" }));
expect(screen.getAllByRole("button", { name: /recommendation:/i })).toHaveLength(12);
```

Add separate tests proving: tab selection does not call Apply; candidate selection opens four variations but calls neither preview nor Apply; variation selection calls preview and candidate-note callbacks only; Apply is disabled before variation selection and then calls `onApply`; rerendering with a different target preserves selection and changes the button target; source/key/mode/tab/live-KEY changes, unmount, and Apply clear selection; unsupported source text renders `Inferred as`; an invalid empty source shows fixed unavailable copy while the other six tabs continue to work.

- [ ] **Step 2: Verify RED**

Run `npm test -- src/components/SevenSlotRecommendationPanel.test.tsx`.

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement panel state and reset boundaries**

Use these state fields only:

```tsx
const [selectedKey, setSelectedKey] = useState<KeyName | "pack">("pack");
const [mode, setMode] = useState<RecommendationMode>("major");
const [sourceSlotIndex, setSourceSlotIndex] = useState(1);
const [expanded, setExpanded] = useState(false);
const [selectedRecommendation, setSelectedRecommendation] = useState<ChordRecommendation | null>(null);
const [selectedVariation, setSelectedVariation] = useState<VoicingVariation | null>(null);
```

Create one `clearPreviewSelection({ collapseMore })` helper that clears recommendation, variation, calls `onCandidateNotesChange([])`, and optionally collapses More. Call it from explicit tab/key/mode handlers, Apply, and an effect keyed by the active source fingerprint `${displayName}:${notes.join(",")}`, effective Recommendation key, mode, and `keyOffset`. Do not key that effect by `targetSlotIndex` or non-active chords.

Add a separate unmount-only effect whose cleanup calls `onCandidateNotesChange([])`. Keep the latest callback in a ref so callback identity changes do not trigger cleanup during normal rerenders.

Compute one active `ChordRecommendationSet` from Task 3. Show candidates `slice(0, expanded ? 12 : 6)`. Candidate click clears variation/candidate notes and opens detail. Variation click calls both `onPreview(variation.notes)` and `onCandidateNotesChange(variation.notes)`. Apply calls `onApply(selectedVariation, selectedRecommendation.name)` and then clears/collapses.

- [ ] **Step 4: Implement accessible markup and exact copy**

Use `role="tablist"`, seven `role="tab"` buttons with `aria-controls`, one `role="tabpanel"`, and exact copy:

- `Recommendation key`
- `Recommendation mode`
- `Major`, `Minor`
- `More recommendations`, `Fewer recommendations`
- `Select a recommendation`
- `Inferred as <name>`
- `Target: Slot <n> — <displayName>`
- `Apply <chordName> to Slot <n>`

Give every candidate an accessible name beginning `Recommendation:` so count assertions do not include controls. Four variation buttons use the existing `Preview variation <n> <label>` naming pattern. The Apply button is disabled until a variation is selected.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/components/SevenSlotRecommendationPanel.test.tsx src/domain/recommendations.test.ts src/domain/voicings.test.ts
git diff --check
```

Expected: all panel and supporting domain tests PASS with no warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/SevenSlotRecommendationPanel.tsx src/components/SevenSlotRecommendationPanel.test.tsx
git commit -m "feat: add seven-slot recommendation workflow"
```

---

### Task 6: App Preview, Candidate Highlight, and Explicit Target Apply

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Delete: `src/components/RecommendationPanel.tsx`
- Delete: `src/components/RecommendationPanel.test.tsx`
- Modify: `src/domain/recommendations.ts`
- Modify: `src/domain/recommendations.test.ts`

**Interfaces:**
- Consumes: Task 5 panel callbacks and existing `Keyboard88.candidateNotes`.
- Produces: App-level `recommendationCandidateNotes` and reducer dispatch to the current selected target.

- [ ] **Step 1: Add failing App integration tests**

Add tests that:

1. select source tab Slot 2 while Chord Grid target Slot 6 remains selected;
2. choose one recommendation and one variation;
3. assert `previewMocks.playChord` receives the selected absolute notes;
4. assert matching keyboard buttons have `data-candidate="true"` before Apply;
5. assert Slot 2 is unchanged after preview;
6. Apply and assert only Slot 6's chord name/notes change;
7. repeat at KEY 11 and assert stored notes equal preview absolute notes minus 11;
8. change target after preview and assert the chosen variation remains while Apply label follows the new target;
9. emit a live KEY change after preview and assert the variation and keyboard candidate notes clear before any Apply.
10. leave the editor for Shared Packs after preview, return, and assert no keyboard key retains `data-candidate`.

Run `npm test -- src/App.test.tsx` and verify RED because App still renders the legacy panel and does not publish candidate notes.

- [ ] **Step 2: Wire the new component and lifted candidate state**

Replace the legacy import with `SevenSlotRecommendationPanel`. Add:

```tsx
const [recommendationCandidateNotes, setRecommendationCandidateNotes] = useState<number[]>([]);
```

Pass it to the existing keyboard:

```tsx
<Keyboard88
  activeNotes={selectedChord.notes}
  candidateNotes={recommendationCandidateNotes}
  keyOffset={seqtrakKeyOffset}
  // existing callbacks unchanged
/>
```

Render:

```tsx
<SevenSlotRecommendationPanel
  chords={state.pack.chords}
  packKey={state.pack.key}
  keyOffset={seqtrakKeyOffset}
  targetSlotIndex={state.selectedSlotIndex}
  onPreview={(notes) => { void getPreviewEngine().playChord(notes); }}
  onCandidateNotesChange={setRecommendationCandidateNotes}
  onApply={(variation, chordName) => dispatch({
    type: "replaceSelectedChordFromAbsolute",
    absoluteNotes: variation.notes,
    keyOffset: seqtrakKeyOffset,
    displayName: chordName
  })}
/>
```

Do not dispatch on candidate or variation selection. The reducer already targets `state.selectedSlotIndex` and converts absolute notes by live KEY.

- [ ] **Step 3: Remove legacy panel APIs**

Delete the two legacy component files. Remove `getRecommendedChordNames` and the old string-based `getVoicingVariations` from `recommendations.ts`, migrate all imports to Tasks 3–4, and replace old tests with the new public API tests. Confirm `rg -n "RecommendationPanel|getRecommendedChordNames|getVoicingVariations" src` returns only the new `SevenSlotRecommendationPanel` name and no legacy function references.

- [ ] **Step 4: Verify GREEN and state preservation**

Run:

```bash
npm test -- src/App.test.tsx src/components/SevenSlotRecommendationPanel.test.tsx src/components/Keyboard88.test.tsx
npm test -- --maxWorkers=1
git diff --check
```

Expected: focused integration and the complete frontend suite PASS; no MIDI, KEY, reset, sharing, or publication regression.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components src/domain/recommendations.ts src/domain/recommendations.test.ts
git commit -m "feat: integrate explicit recommendation preview and apply"
```

---

### Task 7: Responsive Recommendation Styling and Release Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`
- Modify: `docs/manual-tests/seqtrak-phase-2.md`

**Interfaces:**
- Consumes: Task 5 recommendation tab/detail class names.
- Produces: horizontally scrollable tabs, visible selection/focus, compact candidate grids, and responsive detail controls.

- [ ] **Step 1: Add failing CSS contract assertions**

Extend `src/styles.test.ts` to read `src/styles.css` and assert rules for:

```ts
expect(styles).toMatch(/\.recommendation-tabs\s*\{[^}]*overflow-x:\s*auto;/s);
expect(styles).toMatch(/\.recommendation-tab\[aria-selected="true"\]\s*\{/s);
expect(styles).toMatch(/\.recommendation-candidates\s*\{[^}]*display:\s*grid;/s);
expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.recommendation-apply/s);
expect(styles).not.toMatch(/\.recommendation[^}]*outline:\s*none/s);
```

Run `npm test -- src/styles.test.ts`; expected FAIL because these selectors do not exist.

- [ ] **Step 2: Add scoped responsive styles**

Add classes under `.recommendation-panel` only:

- controls use a wrapping flex row;
- `.recommendation-tabs` uses `display: flex`, `overflow-x: auto`, and non-shrinking tab buttons;
- selected tabs use the existing blue border/box-shadow language;
- `.recommendation-candidates` uses responsive `repeat(auto-fit, minmax(10rem, 1fr))` grid columns;
- detail and target use bordered light-background cards;
- `.recommendation-apply` uses the existing primary action style and disabled opacity;
- at `max-width: 640px`, Apply and More buttons become full width and detail actions stack;
- native focus outlines are not suppressed.

- [ ] **Step 3: Add manual verification cases**

Append to `docs/manual-tests/seqtrak-phase-2.md`:

1. inspect all seven source tabs and confirm source/target independence;
2. confirm six candidates, More to twelve, and balanced reasons;
3. preview a tension voicing and compare sound with orange keyboard candidates;
4. change target after preview and verify Apply follows the target;
5. repeat at KEY 0, 1, and 11;
6. verify horizontal tab scrolling and full-width actions on a narrow viewport;
7. disable Web Audio and confirm Apply remains usable without a crash.

- [ ] **Step 4: Run release verification**

Run each command and require exit code 0:

```bash
npm test -- --maxWorkers=1
npm run test:deployment
npm run test:server
npm run build
git diff --check
git status --short
```

Expected: all frontend, deployment, and server tests PASS; production build and diff check succeed; only the three Task 7 files are modified before commit.

- [ ] **Step 5: Audit scope and secrets**

Run:

```bash
rg -n "supabase|ownership_token|SysEx|sendParameter|deletePack|createPack" src/domain/chordSymbols.ts src/domain/chordInference.ts src/domain/recommendations.ts src/domain/voicings.ts src/components/SevenSlotRecommendationPanel.tsx
git diff --stat a6c7d4f..HEAD
```

Expected: no backend, ownership, SysEx, or persistence calls in recommendation files; diff contains only the planned domain, component, App, style, tests, and manual-test files.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/styles.test.ts docs/manual-tests/seqtrak-phase-2.md
git commit -m "style: add responsive recommendation tabs"
```

- [ ] **Step 7: Confirm clean branch**

Run `git status --short --branch` and `git log -8 --oneline`.

Expected: clean feature branch with seven reviewed implementation commits after the design and plan commits.
