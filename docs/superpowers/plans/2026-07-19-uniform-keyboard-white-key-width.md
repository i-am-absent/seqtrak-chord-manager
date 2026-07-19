# Uniform Keyboard White-Key Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make D, G, and A white keys use the same 18px width as all other white keys.

**Architecture:** Preserve the existing keyboard DOM and `wide-white-key` classification. Change only its CSS width contract and the matching test assertion.

**Tech Stack:** React, CSS, Vitest, TypeScript, Vite

## Global Constraints

- Do not change keyboard DOM, pitch-class classification, ordering, black-key margins, A0 behavior, note selection, or preview behavior.
- Keep `.piano-key.white` and `.piano-key.white.wide-white-key` at exactly `18px`.
- Modify only `src/styles.css` and `src/styles.test.ts` for the implementation commit.

---

### Task 1: Normalize the D, G, and A Width Override

**Files:**
- Modify: `src/styles.test.ts:7-18`
- Modify: `src/styles.css:271-273`

**Interfaces:**
- Consumes: the existing `wide-white-key` class assigned by `Keyboard88`.
- Produces: an 18px rendered width for every white key.

- [ ] **Step 1: Write the failing CSS contract**

Change the wide-key expectation in `src/styles.test.ts` to:

```ts
expect(styles).toMatch(/\.piano-key\.white\.wide-white-key\s*\{[^}]*width:\s*18px;/s);
expect(styles).not.toMatch(/\.piano-key\.white\.wide-white-key\s*\{[^}]*width:\s*36px;/s);
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npm test -- src/styles.test.ts
```

Expected: FAIL because `.piano-key.white.wide-white-key` still declares `width: 36px`.

- [ ] **Step 3: Apply the minimal CSS fix**

Change only this declaration in `src/styles.css`:

```css
.piano-key.white.wide-white-key {
  width: 18px;
}
```

- [ ] **Step 4: Verify GREEN and regressions**

Run:

```bash
npm test -- src/styles.test.ts src/components/Keyboard88.test.tsx
npm test -- --maxWorkers=1
npm run build
git diff --check
```

Expected: focused tests, all frontend tests, and production build PASS; diff check has no output.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/styles.css src/styles.test.ts
git commit -m "style: normalize keyboard white-key widths"
```
