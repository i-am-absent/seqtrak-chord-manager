# SEQTRAK Phase 2 Manual Verification

## Browser

- Use Chrome or Edge.
- Open the app with `npm run dev`.
- Grant Web MIDI permission with SysEx enabled when prompted.

## Connect

1. Connect SEQTRAK over USB.
2. Click `Connect SEQTRAK`.
3. Expected: status becomes `connected`, and at least one input and one output are listed.

## Read

1. Select `SYNTH1`.
2. Click `Read from SEQTRAK`.
3. Expected:
   - Current SCALE is shown.
   - Track sound name appears in Track sound.
   - 7 chord slots update.
   - Each selected slot shows its notes on the keyboard.

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

## KEY-relative chord verification

1. Set the SEQTRAK KEY to `0`, read all seven chord slots, and compare every highlighted or previewed note with the notes played by SEQTRAK.
2. Without rereading the chord slots, change the SEQTRAK KEY to `1`. Verify that all highlights, pitch names, selectable boundaries, and previews move up by one semitone.
3. Change the SEQTRAK KEY to `11` and repeat the highlight, pitch-name, boundary, and preview checks. In particular, verify relative chord values `0x24` and `0x60`.
4. Edit an enabled absolute key, write the chord pack, and reread it. Verify that changing KEY does not alter the raw relative chord value stored by SEQTRAK.
5. Verify that absolute keys outside `0x24 + KEY .. 0x60 + KEY` are disabled.
6. Disconnect SEQTRAK and verify that the same relative chord pack displays and previews at KEY `0`.
7. Record any observed device range different from `0x24..0x60`. Change only the centralized range constants in a separate reviewed change.
