export const MIN_88_KEY_MIDI_NOTE = 21;
export const MAX_88_KEY_MIDI_NOTE = 108;

export const chromaticKeys = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
] as const;

export type KeyName = (typeof chromaticKeys)[number];

export interface ChordSlot {
  slotIndex: number;
  notes: number[];
  displayName: string;
}

export interface ChordPack {
  id?: string;
  packName: string;
  authorName: string;
  tags: string[];
  key: KeyName;
  trackSoundName: string;
  sourceTrackIndex?: number;
  chords: ChordSlot[];
  createdAt?: string;
  reportedCount: number;
  hidden: boolean;
  deleted: boolean;
}

const noteNames = chromaticKeys;
const blackKeyPitchClasses = new Set([1, 3, 6, 8, 10]);

export function midiNoteName(note: number): string {
  const pitchClass = note % 12;
  const octave = Math.floor(note / 12) - 1;
  return `${noteNames[pitchClass]}${octave}`;
}

export function isBlackKey(note: number): boolean {
  return blackKeyPitchClasses.has(note % 12);
}

export function validateChordNotes(notes: number[]): string[] {
  const errors: string[] = [];
  const uniqueNotes = new Set(notes);

  if (notes.length < 1) {
    errors.push("Chord must contain at least one note.");
  }

  if (notes.length > 4) {
    errors.push("Chord must contain no more than four notes.");
  }

  if (uniqueNotes.size !== notes.length) {
    errors.push("Chord notes must be unique.");
  }

  for (const note of notes) {
    if (note < MIN_88_KEY_MIDI_NOTE || note > MAX_88_KEY_MIDI_NOTE) {
      errors.push(`Note ${note} is outside the 88-key range.`);
    }
  }

  return errors;
}

export function validatePack(pack: ChordPack): string[] {
  const errors: string[] = [];

  if (pack.chords.length !== 7) {
    errors.push("Pack must contain exactly seven chord slots.");
  }

  for (const chord of pack.chords) {
    if (chord.slotIndex < 1 || chord.slotIndex > 7) {
      errors.push(`Slot ${chord.slotIndex} is outside the 1-7 slot range.`);
    }

    errors.push(...validateChordNotes(chord.notes));
  }

  return errors;
}

export function createDefaultPack(): ChordPack {
  return {
    packName: "Untitled Pack",
    authorName: "Anonymous",
    tags: [],
    key: "C",
    trackSoundName: "Unknown sound",
    chords: [
      { slotIndex: 1, notes: [60, 64, 67], displayName: "C" },
      { slotIndex: 2, notes: [62, 65, 69], displayName: "Dm" },
      { slotIndex: 3, notes: [64, 67, 71], displayName: "Em" },
      { slotIndex: 4, notes: [65, 69, 72], displayName: "F" },
      { slotIndex: 5, notes: [67, 71, 74], displayName: "G" },
      { slotIndex: 6, notes: [69, 72, 76], displayName: "Am" },
      { slotIndex: 7, notes: [71, 74, 77], displayName: "Bdim" }
    ],
    reportedCount: 0,
    hidden: false,
    deleted: false
  };
}
