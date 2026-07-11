# SEQTRAK KEY-Relative Chord Notes Design

## Goal

Represent chord notes exactly as SEQTRAK stores them: as note numbers relative to the device-wide `KEY` parameter. Use the current device `KEY` value to map those relative notes to the absolute notes shown on the keyboard and used for preview. Keep parameter monitoring general enough to support additional SEQTRAK Parameter Change addresses later.

## Confirmed Device Behavior

- The global `KEY` parameter is stored at SysEx address `30 40 7F`.
- `KEY` is an integer from `0` through `11`.
- `KEY` applies across tracks.
- Every non-empty chord note value is relative to `KEY`.
- For example, chord value `0x3C` maps to MIDI note `60 + KEY`; at `KEY = 1`, it maps to C#4 (MIDI note 61).
- Chord value `0x00` means an unused chord-note position and is never transposed.
- `KEY` is read-only in this application.

## Data Model

`ChordPack` remains the application's editable bundle of seven chord slots plus web metadata. It does not store the connected device's `KEY` value.

`ChordSlot.notes` stores one to four SEQTRAK-relative note numbers. This applies to packs read from the device, locally created packs, and future imported or shared packs. The stored values therefore match the SEQTRAK chord representation and do not change when the device `KEY` changes.

The existing `ChordPack.key` remains a musical key used for recommendations and classification. It is independent of the device-wide SEQTRAK `KEY` parameter.

The current SEQTRAK key offset is transient connection state:

- While connected, it reflects the latest valid device `KEY` value.
- While disconnected, it is fixed at `0`.
- It is not persisted in a pack or treated as pack metadata.

## Note Conversion and Range Policy

Conversion functions define the boundary between stored relative notes and absolute notes used by the UI:

```text
absolute note = relative note + current SEQTRAK key offset
relative note = absolute note - current SEQTRAK key offset
```

All non-empty chord notes use these conversions. Empty value `0x00` bypasses conversion.

The permitted relative chord-note range is a centralized policy rather than values repeated through the application. Its initial values remain `0x24` through `0x60`. The policy exposes validation and conversion helpers so that later device testing can change the limits in one place.

For a current key offset `K`, the selectable absolute keyboard range is initially `0x24 + K` through `0x60 + K`. Keys outside that range are visibly disabled and cannot be selected. Stored relative notes are validated against the same centralized policy before writing.

## Editing and Presentation

The editor keeps relative notes as its source of truth and derives presentation values from the current key offset.

- Keyboard highlighting uses absolute notes derived from the selected slot's relative notes.
- Clicking an enabled keyboard key converts its absolute note back to a relative note before toggling the selected slot.
- Displayed pitch names are derived from absolute notes.
- Web Audio and MIDI preview convert relative notes to absolute notes immediately before playback.
- Recommendation voicings are produced as absolute notes and converted to relative notes when applied to a chord slot.
- SEQTRAK reads store received non-empty chord values without transposition.
- SEQTRAK writes send stored relative notes without transposition.

When `KEY` changes, the application updates only transient connection state. The stored pack and relative chord notes remain unchanged. Keyboard highlighting, pitch names, selectable range, and subsequent previews re-render using the new offset.

When the device disconnects, the key offset returns to `0`. The editor continues to work in browser-only mode using that fixed offset.

## Parameter Change Monitoring

MIDI input uses one shared Parameter Change receiver rather than creating unrelated permanent listeners for individual features. The receiver decodes each supported Yamaha Parameter Change SysEx message and dispatches it by its three-byte address.

The client exposes an address-based subscription interface conceptually equivalent to:

```ts
subscribeParameter(address, callback): unsubscribe
```

The monitoring mechanism supports:

- simultaneous subscriptions to different addresses;
- multiple subscribers to the same address;
- independent unsubscription;
- safe dispatch when a subscriber removes itself;
- cleanup of the MIDI listener and all subscriptions when the client is disposed;
- parameter request/response waiting through the same decoded message stream.

A Parameter Change received as the response to an explicit request is also a normal observed change and may notify persistent subscribers. Consumers must tolerate receiving the same value more than once.

## KEY Lifecycle

On connection:

1. Create the shared Parameter Change receiver.
2. Subscribe the device-state owner to address `30 40 7F`.
3. Request the current `KEY` value.
4. Accept only an integer from `0` through `11` and update transient connection state.

Before each chord-pack read and write, request `KEY` again and wait for a valid response. This prevents an operation from using stale state if a previous notification was missed. Because the subscription is already active, a KEY change occurring during setup is observed by the same receiver.

During the connection, every valid Parameter Change for `30 40 7F` updates the key offset immediately. On disconnect or client disposal, remove the subscription and reset the offset to `0`.

## Read and Write Consistency

A chord operation uses the valid KEY obtained at its start for any UI-boundary conversion associated with that operation. Raw device reads and writes remain relative and therefore do not need note transposition.

Write verification compares the relative chord values sent with the relative chord values read back. A concurrent KEY change does not create a false mismatch because KEY is not part of either chord payload.

If the KEY request fails or returns an invalid value, the chord read or write is stopped before processing chord parameters. This makes device state explicit and avoids presenting an operation as synchronized when the application could not confirm the global parameter.

## Error Handling

- A KEY request timeout or MIDI send failure aborts the current read or write and presents a recoverable device error.
- A KEY value outside `0..11` is not applied. The current operation fails, while unsolicited invalid notifications leave the last valid connected value unchanged and report an error.
- An attempted keyboard edit outside the current derived range is ignored and the key remains visibly disabled.
- A pack containing a relative note outside the configured range fails validation and cannot be written.
- Disconnect always clears subscriptions and resets the transient key offset to `0`.

## Testing

Domain and conversion tests cover:

- relative-to-absolute and absolute-to-relative conversion for KEY values `0`, `1`, and `11`;
- every non-empty note receiving the offset, rather than special-casing `0x3C`;
- `0x00` remaining an empty value;
- both configured range boundaries and disabled absolute keys;
- changing the centralized range policy without requiring changes to consumers.

MIDI client tests cover:

- KEY address encoding and valid KEY requests;
- rejection of values outside `0..11`;
- subscriptions to multiple addresses;
- multiple subscribers on one address;
- independent unsubscribe and complete disposal;
- request responses and unsolicited Parameter Changes sharing the receiver;
- repeated delivery of the same value.

Workflow and UI tests cover:

- KEY being requested before each chord read and write;
- storing device chord values as relative notes without transposition;
- writing relative notes unchanged;
- immediate keyboard, pitch-name, selectable-range, and preview updates after a KEY notification;
- keyboard edits and recommendation applications converting absolute notes back to relative notes;
- disconnect resetting KEY to `0` without modifying the pack;
- invalid or timed-out KEY reads blocking device operations;
- write verification remaining relative and stable across KEY changes.

Manual device verification covers KEY values `0`, `1`, and `11`, boundary notes, unsolicited KEY changes from SEQTRAK, all seven chord slots, preview pitch, writes, and read-back verification. The configured chord-note range may be revised after this verification without redesigning the conversion or UI flow.

## Out of Scope

- Changing the SEQTRAK `KEY` parameter from the application.
- Persisting or publishing the connected device's transient KEY value.
- Implementing feature-specific behavior for Parameter Change addresses other than `KEY`; this change provides only the reusable subscription mechanism for them.
