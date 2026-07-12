import {
  isAbsoluteNoteSelectable,
  isBlackKey,
  MAX_88_KEY_MIDI_NOTE,
  midiNoteName,
  MIN_88_KEY_MIDI_NOTE,
  relativeToAbsoluteNote
} from "../domain/music";

interface Keyboard88Props {
  activeNotes: number[];
  candidateNotes?: number[];
  keyOffset: number;
  onToggleNote: (note: number) => void;
  onPreviewNote: (note: number) => void;
}

export function Keyboard88({
  activeNotes,
  candidateNotes = [],
  keyOffset,
  onToggleNote,
  onPreviewNote
}: Keyboard88Props) {
  const absoluteActiveNotes = activeNotes.map((note) => relativeToAbsoluteNote(note, keyOffset));
  const notes = Array.from(
    { length: MAX_88_KEY_MIDI_NOTE - MIN_88_KEY_MIDI_NOTE + 1 },
    (_, index) => MIN_88_KEY_MIDI_NOTE + index
  );

  return (
    <div className="keyboard-wrap" role="group" aria-label="88-key piano keyboard">
      <span id="keyboard-candidate-note" hidden>
        Candidate note
      </span>
      <div className="keyboard">
        {notes.map((note) => {
          const selected = absoluteActiveNotes.includes(note);
          const candidate = candidateNotes.includes(note);
          const disabled = !isAbsoluteNoteSelectable(note, keyOffset);
          const label = midiNoteName(note);
          return (
            <button
              aria-label={label}
              aria-pressed={selected}
              aria-describedby={candidate ? "keyboard-candidate-note" : undefined}
              className={[
                "piano-key",
                isBlackKey(note) ? "black" : "white",
                selected ? "active" : "",
                candidate ? "candidate" : ""
              ].join(" ")}
              data-candidate={candidate ? "true" : undefined}
              disabled={disabled}
              key={note}
              onClick={() => {
                onPreviewNote(note);
                onToggleNote(note);
              }}
              title={midiNoteName(note)}
              type="button"
            />
          );
        })}
      </div>
    </div>
  );
}
