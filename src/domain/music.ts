export const MIN_88_KEY_MIDI_NOTE = 21;
export const MAX_88_KEY_MIDI_NOTE = 108;
export const SEQTRAK_MIN_CHORD_NOTE = 0x24;
export const SEQTRAK_MAX_CHORD_NOTE = 0x60;

export function assertSeqtrakKeyOffset(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 11) {
    throw new Error("SEQTRAK KEY must be an integer from 0 to 11.");
  }
}

export function relativeToAbsoluteNote(note: number, keyOffset: number): number {
  assertSeqtrakKeyOffset(keyOffset);
  return note + keyOffset;
}

export function absoluteToRelativeNote(note: number, keyOffset: number): number {
  assertSeqtrakKeyOffset(keyOffset);
  return note - keyOffset;
}

export function isAbsoluteNoteSelectable(note: number, keyOffset: number): boolean {
  const relative = absoluteToRelativeNote(note, keyOffset);
  return relative >= SEQTRAK_MIN_CHORD_NOTE && relative <= SEQTRAK_MAX_CHORD_NOTE;
}

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

export const seqtrakTracks = [
  { index: 0, name: "KICK" },
  { index: 1, name: "SNARE" },
  { index: 2, name: "CLAP" },
  { index: 3, name: "HAT1" },
  { index: 4, name: "HAT2" },
  { index: 5, name: "PERC1" },
  { index: 6, name: "PERC2" },
  { index: 7, name: "SYNTH1" },
  { index: 8, name: "SYNTH2" },
  { index: 9, name: "DX" }
] as const;

export type SeqtrakTrackIndex = (typeof seqtrakTracks)[number]["index"];

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
    if (!Number.isFinite(note) || !Number.isInteger(note)) {
      errors.push(`Note ${note} must be a finite integer.`);
      continue;
    }

    if (note < SEQTRAK_MIN_CHORD_NOTE || note > SEQTRAK_MAX_CHORD_NOTE) {
      errors.push(`Note ${note} is outside the SEQTRAK chord range.`);
    }
  }

  return errors;
}

export function validatePack(pack: ChordPack): string[] {
  const errors: string[] = [];

  if (pack.chords.length !== 7) {
    errors.push("Pack must contain exactly seven chord slots.");
  }

  const slotIndexes = pack.chords.map((chord) => chord.slotIndex);
  const uniqueSlotIndexes = new Set(slotIndexes);

  if (uniqueSlotIndexes.size !== slotIndexes.length) {
    errors.push("Slot indexes must be unique.");
  }

  for (let slotIndex = 1; slotIndex <= 7; slotIndex += 1) {
    if (!uniqueSlotIndexes.has(slotIndex)) {
      errors.push("Pack must include slots 1 through 7.");
      break;
    }
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
