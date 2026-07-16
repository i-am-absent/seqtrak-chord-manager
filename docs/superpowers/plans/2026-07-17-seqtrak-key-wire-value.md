# SEQTRAK KEY Wire-Value Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the SEQTRAK KEY wire range `0x40..0x4B` into the application's logical offset range `0..11` for both explicit reads and live Parameter Change notifications.

**Architecture:** Keep the shared Parameter Change receiver and generic `subscribeParameter` API raw and address-oriented. Put the KEY wire codec in the SysEx module, then expose logical values through KEY-specific `SeqtrakClient.readCurrentKey()` and `subscribeCurrentKey()` boundaries. The React application consumes only those KEY-specific APIs, while chord-note wire values and `ChordPack` remain unchanged.

**Tech Stack:** TypeScript, React, Web MIDI API abstractions, Vitest, Testing Library, Vite

## Global Constraints

- KEY address remains `30 40 7F`.
- KEY wire values are integers from `0x40` through `0x4B`; logical offsets are integers from `0` through `11`.
- `subscribeParameter(address, callback)` continues returning raw seven-bit Parameter Change values.
- `ChordPack` does not store KEY, and chord-note read/write values remain relative and unchanged.
- Invalid live KEY messages preserve the last valid offset and are reported to the application.
- No new dependencies.

---

## File Structure

- `src/midi/seqtrakSysex.ts`: owns the focused conversion from KEY wire value to logical offset.
- `src/midi/seqtrakSysex.test.ts`: proves conversion boundaries and rejection of invalid wire values.
- `src/midi/seqtrakClient.ts`: applies KEY conversion to explicit requests and live KEY subscriptions while retaining the raw generic subscription.
- `src/midi/seqtrakClient.test.ts`: proves read, subscription, error, generic raw-monitoring, and unchanged chord behavior.
- `src/App.tsx`: consumes the logical KEY-specific subscription and reports live decoding errors.
- `src/App.test.tsx`: proves connection wiring and live KEY error handling through the client API.

### Task 1: Add the KEY Wire Decoder

**Files:**
- Modify: `src/midi/seqtrakSysex.test.ts`
- Modify: `src/midi/seqtrakSysex.ts`

**Interfaces:**
- Consumes: a raw Parameter Change value as `number`.
- Produces: `decodeKeyWireValue(value: number): number`, returning a logical offset from `0` through `11` or throwing an `Error`.

- [ ] **Step 1: Write the failing decoder tests**

Add `decodeKeyWireValue` to the import from `./seqtrakSysex`, then add:

```ts
it("decodes the KEY wire range into logical offsets", () => {
  expect(decodeKeyWireValue(0x40)).toBe(0);
  expect(decodeKeyWireValue(0x41)).toBe(1);
  expect(decodeKeyWireValue(0x4b)).toBe(11);
});

it("rejects values outside the KEY wire range", () => {
  expect(() => decodeKeyWireValue(0x3f)).toThrow(
    "Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75."
  );
  expect(() => decodeKeyWireValue(0x4c)).toThrow(
    "Invalid SEQTRAK KEY wire value 76; expected an integer from 64 to 75."
  );
  expect(() => decodeKeyWireValue(Number.NaN)).toThrow(
    "Invalid SEQTRAK KEY wire value NaN; expected an integer from 64 to 75."
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/midi/seqtrakSysex.test.ts`

Expected: FAIL because `decodeKeyWireValue` is not exported.

- [ ] **Step 3: Implement the minimal decoder**

Add beside `keyAddress()` in `src/midi/seqtrakSysex.ts`:

```ts
const KEY_WIRE_MIN = 0x40;
const KEY_WIRE_MAX = 0x4b;

export function decodeKeyWireValue(value: number): number {
  if (!Number.isInteger(value) || value < KEY_WIRE_MIN || value > KEY_WIRE_MAX) {
    throw new Error(
      `Invalid SEQTRAK KEY wire value ${value}; expected an integer from ${KEY_WIRE_MIN} to ${KEY_WIRE_MAX}.`
    );
  }

  return value - KEY_WIRE_MIN;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/midi/seqtrakSysex.test.ts`

Expected: all `seqtrakSysex` tests PASS.

- [ ] **Step 5: Commit the decoder**

```bash
git add src/midi/seqtrakSysex.ts src/midi/seqtrakSysex.test.ts
git commit -m "fix: decode SEQTRAK KEY wire values"
```

### Task 2: Apply KEY Decoding in SeqtrakClient

**Files:**
- Modify: `src/midi/seqtrakClient.test.ts`
- Modify: `src/midi/seqtrakClient.ts`

**Interfaces:**
- Consumes: `decodeKeyWireValue(value: number): number`, `keyAddress()`, and the existing raw `ParameterChangeReceiver`.
- Produces: `readCurrentKey(): Promise<number>` returning a logical offset, plus `subscribeCurrentKey(callback: (value: number) => void, onError: (error: Error) => void): () => void`.
- Preserves: `subscribeParameter(address: SysexAddress, callback: (value: number) => void): () => void` as a raw-value API.

- [ ] **Step 1: Change explicit-read tests to use confirmed wire values**

Replace the first two KEY tests in `src/midi/seqtrakClient.test.ts` with:

```ts
it("reads and decodes the current key", async () => {
  const input = new MockMidiInput();
  const output = new MockMidiOutput(() => {
    input.emit(encodeParameterChange(keyAddress(), 0x4b));
  });
  const client = new SeqtrakClient(input, output);

  await expect(client.readCurrentKey()).resolves.toBe(11);
  client.dispose();
});

it("rejects an invalid current key wire value", async () => {
  const input = new MockMidiInput();
  const output = new MockMidiOutput(() => {
    input.emit(encodeParameterChange(keyAddress(), 0x3f));
  });
  const client = new SeqtrakClient(input, output);

  await expect(client.readCurrentKey()).rejects.toThrow(
    "Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75."
  );
  client.dispose();
});
```

In the remaining read/write tests, change responses to KEY requests from logical raw values such as `1` to their wire equivalent `0x41`. Do not change chord-note responses or the raw generic-subscription test.

- [ ] **Step 2: Add the failing live-subscription test**

Add:

```ts
it("decodes live KEY changes without changing generic raw subscriptions", () => {
  const input = new MockMidiInput();
  const client = new SeqtrakClient(input, new MockMidiOutput());
  const keys: number[] = [];
  const errors: Error[] = [];
  const rawKeys: number[] = [];

  client.subscribeCurrentKey(
    (value) => keys.push(value),
    (error) => errors.push(error)
  );
  client.subscribeParameter(keyAddress(), (value) => rawKeys.push(value));

  input.emit(encodeParameterChange(keyAddress(), 0x42));
  input.emit(encodeParameterChange(keyAddress(), 0x3f));

  expect(keys).toEqual([2]);
  expect(errors.map((error) => error.message)).toEqual([
    "Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75."
  ]);
  expect(rawKeys).toEqual([0x42, 0x3f]);
  client.dispose();
});
```

- [ ] **Step 3: Run the focused client test and verify RED**

Run: `npm test -- src/midi/seqtrakClient.test.ts`

Expected: FAIL because `readCurrentKey()` still treats `0x4B` as a logical value and `subscribeCurrentKey` does not exist.

- [ ] **Step 4: Implement KEY-specific read and subscription boundaries**

Import `decodeKeyWireValue` from `./seqtrakSysex`. Replace `readCurrentKey()` and add the new subscription before `subscribeParameter()`:

```ts
async readCurrentKey(): Promise<number> {
  return decodeKeyWireValue(await this.requestParameter(keyAddress()));
}

subscribeCurrentKey(
  callback: (value: number) => void,
  onError: (error: Error) => void
): () => void {
  return this.receiver.subscribe(keyAddress(), (wireValue) => {
    try {
      callback(decodeKeyWireValue(wireValue));
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Invalid SEQTRAK KEY wire value."));
    }
  });
}
```

Remove the now-unused `assertSeqtrakKeyOffset` import from `seqtrakClient.ts`. Leave `subscribeParameter` unchanged.

- [ ] **Step 5: Run the client and SysEx tests and verify GREEN**

Run: `npm test -- src/midi/seqtrakSysex.test.ts src/midi/seqtrakClient.test.ts`

Expected: both test files PASS; chord read/write assertions still use unchanged chord values.

- [ ] **Step 6: Commit the client boundary**

```bash
git add src/midi/seqtrakClient.ts src/midi/seqtrakClient.test.ts
git commit -m "fix: expose logical SEQTRAK KEY offsets"
```

### Task 3: Consume the KEY-Specific Subscription in App

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SeqtrakClient.subscribeCurrentKey(callback, onError)` and `readCurrentKey()`, both exposing logical KEY semantics.
- Produces: transient `seqtrakKeyOffset` updates for valid live values and a user-visible message for invalid live wire values.

- [ ] **Step 1: Update the client mock and write failing wiring assertions**

In the hoisted `midiMocks` object, replace `subscribeParameter` with `subscribeCurrentKey` and add:

```ts
keyErrorCallback: undefined as ((error: Error) => void) | undefined,
```

Reset both callbacks in `beforeEach`, then configure:

```ts
midiMocks.mockClient.subscribeCurrentKey.mockReset().mockImplementation((callback, onError) => {
  midiMocks.keyCallback = callback;
  midiMocks.keyErrorCallback = onError;
  return midiMocks.keyUnsubscribe;
});
```

Change the connection assertion to:

```ts
expect(midiMocks.mockClient.subscribeCurrentKey).toHaveBeenCalledWith(
  expect.any(Function),
  expect.any(Function)
);
```

Add a live decoding-error test:

```ts
it("reports an invalid live KEY wire value without replacing the last offset", async () => {
  renderApp(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Connect SEQTRAK" }));
  await waitFor(() => expect(screen.getByText("Status: connected")).toBeInTheDocument());

  act(() => {
    midiMocks.keyCallback?.(2);
    midiMocks.keyErrorCallback?.(
      new Error("Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75.")
    );
  });

  expect(screen.getByText(
    "Invalid SEQTRAK KEY wire value 63; expected an integer from 64 to 75."
  )).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "D4" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run the focused App test and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because App still invokes `subscribeParameter(keyAddress(), receiveKey)`.

- [ ] **Step 3: Wire App to the KEY-specific subscription**

In `src/App.tsx`, remove the unused `keyAddress` import. Add this error callback beside `receiveKey`:

```ts
const receiveKeyError = (error: Error): void => {
  if (generation !== connectionGenerationRef.current) {
    return;
  }
  dispatch({ type: "setMessage", message: error.message });
};
```

Replace the raw subscription with:

```ts
keyUnsubscribeRef.current = client.subscribeCurrentKey(receiveKey, receiveKeyError);
```

Keep `receiveKey` validation as a defensive logical-range check and keep initial `readCurrentKey()` handling unchanged.

- [ ] **Step 4: Run the focused App test and verify GREEN**

Run: `npm test -- src/App.test.tsx`

Expected: all App tests PASS, including connection, live KEY updates, invalid live wire reporting, and disconnect reset behavior.

- [ ] **Step 5: Commit the App integration**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "fix: monitor decoded SEQTRAK KEY changes"
```

### Task 4: Full Regression Verification

**Files:**
- Verify only; no production changes expected.

**Interfaces:**
- Consumes: all completed KEY conversion changes.
- Produces: evidence that unit tests, server tests, type checking, and production bundling remain healthy.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`

Expected: all Vitest tests PASS with no failed test files.

- [ ] **Step 2: Run the static-server tests**

Run: `npm run test:server`

Expected: all Node static-server tests PASS.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript project build and Vite production build both complete successfully.

- [ ] **Step 4: Confirm the final scope**

Run:

```bash
git status --short
git diff HEAD~3 -- src/midi/seqtrakSysex.ts src/midi/seqtrakClient.ts src/App.tsx
rg -n "subscribeParameter\(keyAddress|subscribeCurrentKey|decodeKeyWireValue" src
```

Expected: the worktree is clean; KEY-specific consumers use `subscribeCurrentKey`; generic `subscribeParameter` remains available; no chord-note conversion code changed.
