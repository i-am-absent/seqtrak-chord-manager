# SEQTRAK Chord Manager Design

## Goal

Build a browser-based chord pack manager for Yamaha SEQTRAK. The app lets users connect to SEQTRAK over USB-MIDI, read and edit one Synth track's seven chord slots, preview chords, write packs back to SEQTRAK, and anonymously share one-track chord packs with other users.

In this document, "chord" means a set of 1 to 4 MIDI note numbers. A "pack" means one Synth track's seven chord slots plus web metadata.

## Platform

- Frontend: static web app hosted on GitHub Pages.
- Browser support: Chrome and Edge family only for device connection, because Web MIDI with SysEx is required.
- Backend: Supabase Free as the first target for public pack storage, reports, and future recommendation statistics.
- Device connection: Web MIDI API with SysEx permission.

Unsupported browsers can still browse packs, edit chords, and use Web Audio preview, but cannot read from or write to SEQTRAK.

## Architecture

The browser app owns all device interaction. Supabase never receives raw SysEx traffic.

Main components:

- `MidiAccessService`: requests Web MIDI/SysEx permission, lists MIDI ports, tracks connection state, and exposes selected input/output ports.
- `SeqtrakSysexAdapter`: encodes and decodes known SEQTRAK SysEx messages for track sound names, seven chord slots, and write operations.
- `PackEditor`: owns the current editable pack, selected chord slot, key selection, metadata edits, and keyboard note toggles.
- `PreviewEngine`: plays chords through Web Audio by default and can optionally send MIDI Note On/Off to SEQTRAK when connected.
- `RecommendationEngine`: initially uses client-side harmonic rules and voicing generators; later mixes in Supabase aggregate co-occurrence data.
- `PackRepository`: reads and writes public pack data, reports, hidden/deleted flags, and usage metrics through Supabase.

## Data Model

### Pack

A pack represents one SEQTRAK Synth track:

- `id`: Supabase-generated identifier.
- `packName`: editable web-only name.
- `authorName`: optional display name. Empty input is stored/displayed as `Anonymous`.
- `tags`: candidate tags plus user-entered free tags.
- `key`: pack key used by default for recommendations.
- `trackSoundName`: SEQTRAK track sound name read through SysEx.
- `sourceTrackIndex`: optional original track index for context only.
- `chords`: exactly seven chord slots.
- `createdAt`: creation timestamp.
- `reportedCount`: count of user reports.
- `hidden`: admin moderation flag.
- `deleted`: author deletion flag.
- `deleteTokenHash`: hash of a browser-generated deletion token.

### Chord Slot

- `slotIndex`: 1 through 7.
- `notes`: 1 to 4 MIDI note numbers.
- `displayName`: derived chord name when possible, user-overridable later if needed.

## Anonymous Posting and Deletion

Users do not create accounts or log in. Posting is immediate and public.

On post:

1. The browser generates a random `deleteToken`.
2. Supabase stores only `deleteTokenHash`.
3. The browser stores `{ packId, deleteToken }` in local storage.

When the same browser opens its own pack, the UI can show a delete action. Deletion sends the token for verification and marks the pack as `deleted = true`. Deleted packs are excluded from public lists. If the user clears browser data or uses another device, delete access is lost.

Author names are also stored locally only for convenience. The same author name may be used by multiple people.

Moderation is simple in the initial version:

- Public posts appear immediately.
- Any user can report a pack.
- Admins can hide reported packs by setting `hidden = true` in Supabase or a later minimal admin UI.
- Public queries show only `hidden = false` and `deleted = false`.

## Editor UI

The main editor uses a progression-first layout.

Top area:

- SEQTRAK connection state.
- Read from device.
- Write to device.
- Browse public packs.

Main editing area:

- Left side: Track and Pack metadata.
  - SEQTRAK track sound name from SysEx.
  - Pack name.
  - Author name.
  - Tags.
  - Pack key.
- Right side: compact 2 by 4 chord grid:
  - Row 1: `Space`, `1`, `2`, `3`
  - Row 2: `4`, `5`, `6`, `7`
  - `Space` is a visual spacer matching the desired layout, not a stored chord slot.

Below the grid:

- Horizontal 88-key piano keyboard.
- Clicking a key toggles whether that MIDI note is part of the selected chord.
- Each chord must contain 1 to 4 notes.
- Clicking a key plays that note.
- Selecting or previewing a chord plays all chord notes.

## SEQTRAK Read and Write Flow

Reading from SEQTRAK:

1. User connects SEQTRAK and grants Web MIDI SysEx permission.
2. User selects a Synth track.
3. App reads the track sound name and seven chord slots through SysEx.
4. App creates a local editable pack.
5. Nothing is posted or persisted remotely until the user explicitly posts it.

Writing to SEQTRAK:

1. User chooses a pack or edits the current pack.
2. App uses the currently selected Synth track as the default target.
3. Before writing, the app shows a confirmation dialog with the target track and warns that all seven chord slots will be overwritten.
4. App sends SysEx write messages.
5. When possible, app re-reads the target track and verifies that the seven chord slots match what was sent.
6. On mismatch or timeout, app shows a warning and offers retry or return to editing.

## Public Pack Browser

The public browser initially sorts by newest posts.

Users can filter by:

- Tags.
- Pack key.
- Author name.

Pack cards/detail views show:

- Pack name.
- Author name or `Anonymous`.
- Tags.
- Key.
- Track sound name.
- Seven chord slots.
- Preview.
- Write to SEQTRAK.
- Report.
- Delete, only when the browser has the matching local delete token.

## Preview

Preview supports two modes:

- Web Audio mode: default, simple synth tone such as sine/saw/square. It works without SEQTRAK.
- SEQTRAK audition mode: when connected, app can send MIDI Note On/Off to SEQTRAK for preview.

The initial sound design can be simple. The goal is to confirm pitch and chord shape, not to emulate SEQTRAK sounds.

## Recommendation Design

Recommendations use a hybrid strategy.

Initial version:

- Uses the pack key by default.
- Recommendation UI includes a key selector with `Pack Key` plus the other 11 keys as temporary overrides.
- Shows recommended next chord names in a horizontal list.
- After selecting a chord name, shows `Voicing Variation 1` through `4` horizontally.
- Selecting a variation highlights its 1 to 4 MIDI notes on the 88-key keyboard.
- User can preview and apply the candidate to the selected slot.

Future version:

- Supabase aggregate data ranks candidates by chord transitions observed in public packs.
- Aggregation can be filtered or weighted by key and tags.
- Individual author behavior is not tracked; only anonymous aggregate pack statistics are used.

## Error Handling

The app distinguishes these errors:

- Browser does not support Web MIDI/SysEx.
- SysEx permission denied.
- SEQTRAK not connected.
- MIDI port disconnected during operation.
- Target track is not selected.
- SysEx read timeout.
- SysEx write failure.
- Write verification mismatch.
- Supabase post/list/report/delete failure.
- Invalid pack data, such as an empty chord or more than four notes in a chord.

Errors should explain the recovery action: reconnect, grant permission, retry, choose a track, return to editing, or continue with browser-only features.

## Testing

Unit tests:

- Pack and chord validation.
- Chord note limits.
- Key and tag filtering logic.
- Recommendation candidate generation.
- Voicing variation generation.
- SysEx encode/decode using known message fixtures.
- Delete token hashing and local ownership checks.

Integration tests:

- Supabase pack posting, listing, filtering, reporting, hiding/deleting behavior against a test project or mocked client.
- Web MIDI unsupported and permission-denied UI states.
- Read/edit/write flows with mocked MIDI ports.
- Web Audio preview calls.

Manual verification:

- Chrome/Edge Web MIDI permission flow.
- SEQTRAK read of track sound name and seven chord slots.
- SEQTRAK write to a selected Synth track.
- Post-write re-read verification.
- Pack posting, browsing, reporting, author-side deletion, and writing a public pack to SEQTRAK.

## Out of Scope for Initial Version

- User accounts and login.
- Editing published packs after posting, except author-side deletion.
- Full admin dashboard, beyond DB-level moderation or a minimal later UI.
- Safari/Firefox MIDI support.
- Exact SEQTRAK sound emulation in Web Audio.
- AI-generated progressions from text prompts.
