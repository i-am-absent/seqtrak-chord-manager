# MIDI Port Selection Design

## Goal

Connect to the correct SEQTRAK Web MIDI input and output when other MIDI ports are present. Automatically prefer ports whose names begin with `SEQTRAK`, while allowing users to select input and output ports independently.

## Background

The current connection flow always uses `access.inputs[0]` and `access.outputs[0]`. On the observed Windows system, both collections contain two `Default App Loopback` ports before `SEQTRAK-1`. The application therefore sends the initial KEY SysEx request to a loopback port and reports a timeout even though SEQTRAK is available.

## User Interface

`DevicePanel` adds two selectors:

- `Input Port`
- `Output Port`

Each option displays the port name and uses the Web MIDI port ID as its value. IDs, rather than names, distinguish ports when multiple entries share the same visible name.

The selectors are disabled while a connection operation is busy. They remain available while disconnected or in an error state so the user can recover by choosing another pair.

## Selection State

`App` owns two transient values:

- selected MIDI input ID;
- selected MIDI output ID.

The selection is not pack metadata and is not persisted remotely. It may remain in React state across reconnect attempts during the current page session.

When a newly retrieved port list still contains the selected ID, that manual selection takes precedence over automatic selection. When a selected ID no longer exists, the selection is cleared before choosing a default.

## Automatic Selection

For each direction independently, automatic selection chooses the first available port whose name begins with `SEQTRAK`, ignoring letter case. A missing or empty name does not match.

Automatic selection runs only when there is no valid current selection. It never replaces a valid manual selection, including a deliberately selected non-SEQTRAK port.

If both directions resolve to ports, the first Connect action continues directly through KEY subscription and initial KEY request. If either direction has no selection, the application does not create `SeqtrakClient`, does not send SysEx, and displays:

`Select MIDI input and output ports, then connect again.`

The first arbitrary port is never used as a fallback.

## Connection Flow

On `Connect SEQTRAK`:

1. Invalidate and release the current client and subscriptions.
2. Request Web MIDI access with SysEx enabled.
3. Store the current input and output lists.
4. Resolve each existing selected ID against its current list.
5. If a selection is invalid or absent, choose the first matching SEQTRAK-prefixed port for that direction.
6. Update both selector values with the resolved IDs.
7. If either direction remains unresolved, stop in the disconnected state and show the manual-selection instruction.
8. Resolve the selected IDs to concrete port objects and create `SeqtrakClient` with that exact pair.
9. Subscribe to KEY and MIDI port state changes, request the initial KEY, and enter the connected state using the existing generation guards.

The existing lifecycle generation prevents stale Web MIDI access or KEY requests from restoring an obsolete connection.

## Manual Selection Flow

When the user changes either selector:

1. Save the new ID for that direction without altering the other direction.
2. Release the current client, KEY subscription, and MIDI state subscription.
3. Reset the transient SEQTRAK KEY offset to `0` and clear current SCALE.
4. Set status to `disconnected`.
5. Display `MIDI port selection changed. Connect again.`

The application does not connect immediately on a selector change. After choosing both ports, the user presses `Connect SEQTRAK` again. The next port refresh preserves both valid manual IDs and uses that exact pair.

## Port State Changes

While connected, a `disconnected` state change for the selected input or output releases the client and resets KEY and SCALE as before. The disappeared port ID is also cleared for its direction. An unrelated port state change does not affect the connection or selections.

On the next Connect action, an absent selected ID is cleared and may be replaced by a current SEQTRAK-prefixed candidate. A valid selection for the other direction remains unchanged.

## Error Handling

- Web MIDI unsupported and permission failures retain their existing messages.
- Missing manual/automatic selection uses the explicit manual-selection instruction and sends no MIDI messages.
- A timeout or other client error identifies the chosen port pair in the user-facing message, followed by the underlying error. This makes a wrong manual selection diagnosable without browser developer tools.
- Changing a selector is an intentional disconnect, not an error.
- An unnamed port is displayed as `Unnamed MIDI input` or `Unnamed MIDI output` and remains manually selectable by ID.

## Component Boundaries

- `midiAccessService` provides pure helpers for validating an existing selected ID and choosing the preferred `SEQTRAK`-prefixed port. It remains responsible for obtaining Web MIDI access and forwarding state changes.
- `App` owns selected IDs, resolves concrete port objects, manages connection lifecycle, and formats connection errors with the selected pair.
- `DevicePanel` renders the two controlled selectors and reports ID changes. It does not decide which port is preferred or create MIDI clients.

## Testing

Pure selection tests cover:

- selecting `SEQTRAK-1` when loopback ports appear first;
- case-insensitive prefix matching;
- preserving a valid manual ID;
- clearing an ID that is absent from a refreshed list;
- returning no selection when no prefix match exists;
- distinguishing duplicate visible names by ID.

Component and application tests cover:

- rendering independent input and output selectors;
- automatic selection and initial connection using the exact SEQTRAK input/output objects;
- no client construction or SysEx when either direction is unresolved;
- manual selector changes disposing the client and both subscriptions;
- selector changes resetting KEY, SCALE, and status;
- reconnect preserving valid manual choices;
- selected input or output disappearance clearing only that direction;
- unrelated port events leaving connection and selections unchanged;
- timeout/error text including both chosen port names;
- existing overlapping-connect, disconnect, and stale-operation generation tests continuing to pass.

## Out of Scope

- Persisting MIDI port selection across browser reloads.
- Pairing input and output by a synthesized device identity.
- Supporting connection to multiple SEQTRAK devices simultaneously.
- Automatically reconnecting immediately after a selector change.
