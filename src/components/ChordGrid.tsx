import { midiNoteName, relativeToAbsoluteNote, type ChordPack } from "../domain/music";

interface ChordGridProps {
  pack: ChordPack;
  keyOffset: number;
  selectedSlotIndex: number;
  onSelectSlot: (slotIndex: number) => void;
  onPreviewSlot?: (slotIndex: number) => void;
}

export function ChordGrid({ pack, keyOffset, selectedSlotIndex, onSelectSlot, onPreviewSlot }: ChordGridProps) {
  return (
    <div className="chord-grid" role="group" aria-label="Chord slots">
      <div className="slot-card space-slot">Space</div>
      {pack.chords.map((chord) => {
        const pitchNames = chord.notes
          .map((note) => relativeToAbsoluteNote(note, keyOffset))
          .map(midiNoteName)
          .join(" ");

        return <button
          className={chord.slotIndex === selectedSlotIndex ? "slot-card selected" : "slot-card"}
          key={chord.slotIndex}
          onClick={() => {
            onSelectSlot(chord.slotIndex);
            onPreviewSlot?.(chord.slotIndex);
          }}
          type="button"
          aria-label={`Slot ${chord.slotIndex} ${chord.displayName}`}
        >
          <strong>{chord.slotIndex}</strong>
          <span>{chord.displayName}</span>
          <span className="slot-pitch-names">{pitchNames}</span>
        </button>
      })}
    </div>
  );
}
