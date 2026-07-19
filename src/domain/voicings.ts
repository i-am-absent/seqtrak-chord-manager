import { CHORD_INTERVALS, type CanonicalChord } from "./chordSymbols";
import {
  assertSeqtrakKeyOffset,
  MAX_88_KEY_MIDI_NOTE,
  MIN_88_KEY_MIDI_NOTE,
  SEQTRAK_MAX_CHORD_NOTE,
  SEQTRAK_MIN_CHORD_NOTE,
} from "./music";

export interface VoicingVariation {
  variation: number;
  label: "close" | "smooth" | "wide" | "high";
  notes: number[];
}

type VoicingLabel = VoicingVariation["label"];

const VARIATION_LABELS: readonly VoicingLabel[] = [
  "close",
  "smooth",
  "wide",
  "high",
];

export function getChordVoicingVariations(
  chord: CanonicalChord,
  keyOffset: number,
): VoicingVariation[] {
  assertSeqtrakKeyOffset(keyOffset);

  const minimum = Math.max(MIN_88_KEY_MIDI_NOTE, SEQTRAK_MIN_CHORD_NOTE + keyOffset);
  const maximum = Math.min(MAX_88_KEY_MIDI_NOTE, SEQTRAK_MAX_CHORD_NOTE + keyOffset);
  const rootPitchClass = normalizePitchClass(chord.root);
  const root = 60 + rootPitchClass;
  const close = CHORD_INTERVALS[chord.quality].map((interval) => root + interval);
  const placements = [
    close,
    close.map((note, index) => note + (index === 0 ? 12 : 0)),
    close.map((note, index) => note - (index === 0 ? 12 : 0)),
    close.map((note) => note + 12),
  ];

  const used = new Set<string>();
  return placements.map((placement, index) => {
    let notes = fitWholeVoicing(
      [...placement].sort((left, right) => left - right),
      minimum,
      maximum,
    );
    if (used.has(voicingKey(notes))) {
      notes = resolveCollision(notes, used, minimum, maximum, rootPitchClass);
    }
    used.add(voicingKey(notes));

    return {
      variation: index + 1,
      label: VARIATION_LABELS[index],
      notes,
    };
  });
}

function fitWholeVoicing(notes: number[], minimum: number, maximum: number): number[] {
  const lowest = Math.min(...notes);
  const highest = Math.max(...notes);
  const minimumShift = Math.ceil((minimum - lowest) / 12);
  const maximumShift = Math.floor((maximum - highest) / 12);

  if (minimumShift > maximumShift) {
    throw new Error("Chord voicing cannot fit the playable note range.");
  }

  const octaveShift = Math.max(minimumShift, Math.min(0, maximumShift)) * 12;
  return notes.map((note) => note + octaveShift);
}

function resolveCollision(
  notes: number[],
  used: ReadonlySet<string>,
  minimum: number,
  maximum: number,
  rootPitchClass: number,
): number[] {
  for (let index = 0; index < notes.length; index += 1) {
    if (normalizePitchClass(notes[index]) === rootPitchClass) {
      continue;
    }

    for (const shift of [12, -12]) {
      const shiftedNote = notes[index] + shift;
      if (shiftedNote < minimum || shiftedNote > maximum) {
        continue;
      }

      const candidate = notes
        .map((note, candidateIndex) =>
          candidateIndex === index ? shiftedNote : note,
        )
        .sort((left, right) => left - right);
      if (new Set(candidate).size === candidate.length && !used.has(voicingKey(candidate))) {
        return candidate;
      }
    }
  }

  throw new Error("Chord voicing variations cannot be made distinct in the playable note range.");
}

function voicingKey(notes: number[]): string {
  return notes.join(",");
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}
