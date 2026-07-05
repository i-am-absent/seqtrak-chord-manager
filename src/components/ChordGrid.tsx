import type { ChordPack } from "../domain/music";

interface ChordGridProps {
  pack: ChordPack;
  selectedSlotIndex: number;
  onSelectSlot: (slotIndex: number) => void;
}

export function ChordGrid({ pack, selectedSlotIndex, onSelectSlot }: ChordGridProps) {
  return (
    <div className="chord-grid" role="group" aria-label="Chord slots">
      <div className="slot-card space-slot">Space</div>
      {pack.chords.map((chord) => (
        <button
          className={chord.slotIndex === selectedSlotIndex ? "slot-card selected" : "slot-card"}
          key={chord.slotIndex}
          onClick={() => onSelectSlot(chord.slotIndex)}
          type="button"
          aria-label={`Slot ${chord.slotIndex} ${chord.displayName}`}
        >
          <strong>{chord.slotIndex}</strong>
          <span>{chord.displayName}</span>
        </button>
      ))}
    </div>
  );
}
