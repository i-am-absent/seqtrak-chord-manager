import { isBlackKey, MAX_88_KEY_MIDI_NOTE, midiNoteName, MIN_88_KEY_MIDI_NOTE } from "../domain/music";

interface Keyboard88Props {
  activeNotes: number[];
  candidateNotes?: number[];
  onToggleNote: (note: number) => void;
  onPreviewNote: (note: number) => void;
}

export function Keyboard88({
  activeNotes,
  candidateNotes = [],
  onToggleNote,
  onPreviewNote
}: Keyboard88Props) {
  const notes = Array.from(
    { length: MAX_88_KEY_MIDI_NOTE - MIN_88_KEY_MIDI_NOTE + 1 },
    (_, index) => MIN_88_KEY_MIDI_NOTE + index
  );

  return (
    <div className="keyboard-wrap" aria-label="88-key piano keyboard">
      <div className="keyboard">
        {notes.map((note) => {
          const selected = activeNotes.includes(note);
          const candidate = candidateNotes.includes(note);
          const label = `${midiNoteName(note)}${selected ? " selected" : candidate ? " candidate" : ""}`;
          return (
            <button
              aria-label={label}
              className={[
                "piano-key",
                isBlackKey(note) ? "black" : "white",
                selected ? "active" : "",
                candidate ? "candidate" : ""
              ].join(" ")}
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
