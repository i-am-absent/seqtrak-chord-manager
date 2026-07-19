# Keyboard White-Key Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the 88-key keyboard geometry so D/G/A widen leftward while E/B retain their width and cumulatively pull all following keys left.

**Architecture:** `Keyboard88` will attach one semantic class to the B0-and-above D/G/A notes. CSS will switch the keyboard track from Grid to Flex, use the existing black-key negative margins to give black keys zero layout width, and widen only the marked white keys; note behavior and MIDI/domain state remain untouched.

**Tech Stack:** React 19, TypeScript, CSS Flexbox, Vitest, Testing Library, Vite

## Global Constraints

- A0 remains 18px wide and otherwise unchanged.
- From B0 onward, D, G, and A white keys are 36px wide.
- E, B, C, and F white keys remain 18px wide.
- Black keys remain 14px wide with `margin-left: -7px` and `margin-right: -7px`.
- Every E/B boundary cumulatively moves that key and every later key left by one 18px key width.
- Preserve all 88 notes, note order, scrolling, interaction, active/candidate states, disabled ranges, and SEQTRAK KEY offset behavior.
- Do not change domain note calculations, MIDI behavior, keyboard height, colors, labels, or focus behavior.

---

### Task 1: Mark D/G/A White Keys Without Changing Behavior

**Files:**
- Modify: `src/components/Keyboard88.tsx`
- Test: `src/components/Keyboard88.test.tsx`

**Interfaces:**
- Consumes: absolute MIDI notes from `MIN_88_KEY_MIDI_NOTE` through `MAX_88_KEY_MIDI_NOTE`.
- Produces: the CSS class `wide-white-key` on D/G/A white-key buttons at MIDI note 23 (B0) or above; no other button receives it.

- [ ] **Step 1: Add the failing class-selection test**

Add this test inside `describe("Keyboard88", ...)` in `src/components/Keyboard88.test.tsx`:

```tsx
it("marks only D, G, and A white keys from B0 onward for widening", () => {
  renderApp(
    <Keyboard88
      activeNotes={[]}
      keyOffset={0}
      onToggleNote={vi.fn()}
      onPreviewNote={vi.fn()}
    />
  );

  for (const noteName of ["D1", "G1", "A1", "D4", "G7", "A7"]) {
    expect(screen.getByRole("button", { name: noteName })).toHaveClass("wide-white-key");
  }

  for (const noteName of ["A0", "B0", "C1", "C#1", "E1", "F1", "B1", "C8"]) {
    expect(screen.getByRole("button", { name: noteName })).not.toHaveClass("wide-white-key");
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/components/Keyboard88.test.tsx
```

Expected: FAIL because `D1` and the other D/G/A buttons do not yet have `wide-white-key`; the existing rendering and interaction tests remain passing.

- [ ] **Step 3: Add the minimal note-class rule**

Add these module constants and helper near the imports in `src/components/Keyboard88.tsx`:

```tsx
const FIRST_ADJUSTED_MIDI_NOTE = 23; // B0
const wideWhitePitchClasses = new Set([2, 7, 9]); // D, G, A

function isWideWhiteKey(note: number): boolean {
  return note >= FIRST_ADJUSTED_MIDI_NOTE && wideWhitePitchClasses.has(note % 12);
}
```

Add the class without changing the existing class order or state logic:

```tsx
className={[
  "piano-key",
  isBlackKey(note) ? "black" : "white",
  isWideWhiteKey(note) ? "wide-white-key" : "",
  selected ? "active" : "",
  candidate ? "candidate" : ""
].join(" ")}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/components/Keyboard88.test.tsx
```

Expected: all three `Keyboard88` tests PASS, including the A0 and E/B exclusions and the existing click/KEY-offset behavior.

- [ ] **Step 5: Commit the semantic class change**

```bash
git add src/components/Keyboard88.tsx src/components/Keyboard88.test.tsx
git commit -m "feat: mark widened keyboard white keys"
```

---

### Task 2: Apply Flex Geometry and Verify the Release

**Files:**
- Modify: `src/styles.css`
- Create: `src/styles.test.ts`

**Interfaces:**
- Consumes: `.keyboard`, `.piano-key`, `.piano-key.white`, `.piano-key.black`, and Task 1's `.wide-white-key` class.
- Produces: a Flex keyboard whose black keys have zero layout width, whose normal white keys are 18px, and whose marked D/G/A keys are 36px.

- [ ] **Step 1: Add the failing CSS contract test**

Create `src/styles.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("keyboard layout styles", () => {
  it("uses zero-width black-key flow and widens only marked white keys", () => {
    expect(styles).toMatch(/\.keyboard\s*\{[^}]*display:\s*flex;/s);
    expect(styles).not.toMatch(/\.keyboard\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(/\.piano-key\s*\{[^}]*flex:\s*0 0 auto;/s);
    expect(styles).toMatch(/\.piano-key\.white\s*\{[^}]*width:\s*18px;/s);
    expect(styles).toMatch(/\.piano-key\.white\.wide-white-key\s*\{[^}]*width:\s*36px;/s);
    expect(styles).toMatch(
      /\.piano-key\.black\s*\{[^}]*margin-left:\s*-7px;[^}]*margin-right:\s*-7px;[^}]*width:\s*14px;/s
    );
  });
});
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```bash
npm test -- src/styles.test.ts
```

Expected: FAIL because `.keyboard` still uses Grid, `.piano-key` has no fixed Flex behavior, and `.wide-white-key` has no 36px rule.

- [ ] **Step 3: Implement the minimal Flex geometry**

Replace the Grid declarations in `.keyboard`, make every key non-shrinking, and add the marked width in `src/styles.css`:

```css
.keyboard {
  display: flex;
  height: 140px;
  min-width: max-content;
}

.piano-key {
  border: 1px solid #aeb7c5;
  border-radius: 0 0 4px 4px;
  cursor: pointer;
  flex: 0 0 auto;
  padding: 0;
  position: relative;
}

.piano-key.white {
  background: #ffffff;
  height: 140px;
  width: 18px;
  z-index: 1;
}

.piano-key.white.wide-white-key {
  width: 36px;
}
```

Keep the existing `.piano-key.black` block unchanged. Its `14px - 7px - 7px = 0px` outer Flex width creates the approved cumulative movement without transforms or absolute positioning.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/components/Keyboard88.test.tsx src/styles.test.ts
```

Expected: all four focused tests PASS.

- [ ] **Step 5: Run the complete verification matrix**

Run each command and require exit code 0:

```bash
npm test -- --maxWorkers=1
npm run test:deployment
npm run test:server
npm run build
git diff --check
git status --short
```

Expected: all frontend, deployment, and server tests PASS; the production build and diff check succeed; only the four planned Task 1/Task 2 files are modified before commit.

- [ ] **Step 6: Commit the layout and CSS contract**

```bash
git add src/styles.css src/styles.test.ts
git commit -m "style: correct keyboard white-key geometry"
```

- [ ] **Step 7: Confirm the final repository state**

Run:

```bash
git status --short --branch
git log -3 --oneline
```

Expected: the branch is clean and the two implementation commits follow the approved design and plan commits.
