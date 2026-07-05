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
