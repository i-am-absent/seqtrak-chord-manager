# SEQTRAK KEY Wire-Value Conversion Design

## Goal

Correctly interpret the SEQTRAK global `KEY` parameter while preserving the generic Parameter Change monitoring API for future parameters.

## Confirmed Device Behavior

An explicit request for address `30 40 7F` produced:

```text
F0 43 10 7F 1C 0C 30 40 7F 40 F7
```

The Parameter Change value byte is therefore `0x40` when the device's logical KEY offset is `0`. The wire representation is `0x40` through `0x4B`, corresponding to logical offsets `0` through `11`.

```text
logical KEY offset = wire value - 0x40
```

Chord-note Parameter Change values remain relative note numbers and are not changed by this conversion.

## API Boundary

The MIDI layer owns the conversion between the device's KEY wire representation and the application's logical key offset.

- Add a focused KEY decoder that accepts only integer wire values from `0x40` through `0x4B` and returns `0` through `11`.
- `SeqtrakClient.readCurrentKey()` applies this decoder before returning a value.
- Add `SeqtrakClient.subscribeCurrentKey(callback, onError)` so unsolicited KEY Parameter Change messages are decoded before reaching application state. `callback` receives logical offsets; `onError` receives a decoding error for invalid wire values.
- Keep `subscribeParameter(address, callback)` unchanged: it continues to expose raw seven-bit Parameter Change values for arbitrary addresses.
- The application uses `subscribeCurrentKey` instead of subscribing directly to `keyAddress()`.

This keeps the generic monitoring mechanism address-oriented and raw, while making every public KEY-specific operation return the same logical representation.

## State and Data Flow

On connection, the application subscribes through `subscribeCurrentKey`, requests the current KEY through `readCurrentKey`, and stores only the decoded offset. A received wire value of `0x40` therefore sets the transient offset to `0`; `0x4B` sets it to `11`.

The decoded offset continues to affect every non-empty chord note at the UI and preview boundaries. `ChordPack`, stored chord values, chord reads, and chord writes remain unchanged and relative to KEY. When disconnected, the offset remains fixed at `0` as previously designed.

## Error Handling

A KEY wire value outside `0x40..0x4B`, including the previously assumed raw range `0..11`, is invalid device data.

- `readCurrentKey()` rejects the operation with an error that includes the invalid raw value and expected wire range.
- `subscribeCurrentKey` does not pass an invalid value to application state. It invokes `onError`, allowing the application to show the error while preserving the last valid offset.
- Generic `subscribeParameter` continues to deliver any valid MIDI data byte without KEY-specific validation.

## Testing

Tests will prove that:

- KEY wire values `0x40`, `0x41`, and `0x4B` decode to logical offsets `0`, `1`, and `11`;
- KEY wire values below `0x40` and above `0x4B` are rejected;
- `readCurrentKey()` returns the decoded logical offset;
- unsolicited KEY changes are decoded through `subscribeCurrentKey`, and invalid changes reach only its error callback;
- generic subscriptions still receive raw values for KEY and other addresses;
- connection succeeds when the device responds with the observed `0x40` message;
- chord Parameter Change values and ChordPack data are unaffected.
