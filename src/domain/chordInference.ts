import {
  CHORD_INTERVALS,
  formatChordSymbol,
  parseChordSymbol,
  type CanonicalChord,
  type ChordQuality,
  type RecommendationMode
} from "./chordSymbols";

export interface ResolveSourceChordInput {
  displayName: string;
  relativeNotes: number[];
  keyOffset: number;
  keyRoot: number;
  mode: RecommendationMode;
}

export interface ResolvedSourceChord {
  chord: CanonicalChord;
  name: string;
  inferred: boolean;
}

type InferenceScore = readonly [
  symmetricDifference: number,
  pitchDistance: number,
  bassRootPenalty: 0 | 1,
  qualityComplexity: number,
  root: number
];

interface InferenceCandidate {
  chord: CanonicalChord;
  score: InferenceScore;
}

const QUALITY_ORDER: readonly ChordQuality[] = [
  "major", "minor", "dim", "aug", "sus2", "sus4",
  "maj7", "m7", "7", "dim7", "m7b5",
  "maj9", "m9", "9", "11", "13",
  "7b9", "7#9", "7#11", "7b13", "add9", "6/9"
];

export function resolveSourceChord(
  input: ResolveSourceChordInput
): ResolvedSourceChord | null {
  const parsedChord = parseChordSymbol(input.displayName);
  if (parsedChord) {
    return { chord: parsedChord, name: input.displayName, inferred: false };
  }

  const soundingNotes = input.relativeNotes
    .filter(note => Number.isFinite(note) && Number.isInteger(note))
    .map(note => note + input.keyOffset);
  if (soundingNotes.length === 0) {
    return null;
  }

  const pitchClasses = new Set(soundingNotes.map(normalizePitchClass));
  const bassPitchClass = normalizePitchClass(Math.min(...soundingNotes));
  const candidates: InferenceCandidate[] = [];

  for (let root = 0; root < 12; root += 1) {
    for (const [qualityComplexity, quality] of QUALITY_ORDER.entries()) {
      const templatePitchClasses = new Set(
        CHORD_INTERVALS[quality].map(interval => normalizePitchClass(root + interval))
      );
      const chord: CanonicalChord = { root, quality };
      candidates.push({
        chord,
        score: [
          symmetricDifferenceSize(pitchClasses, templatePitchClasses),
          pitchDistance(pitchClasses, templatePitchClasses),
          bassPitchClass === root ? 0 : 1,
          qualityComplexity,
          root
        ]
      });
    }
  }

  candidates.sort((left, right) => compareScores(left.score, right.score));
  const chord = candidates[0].chord;
  return {
    chord,
    name: formatChordSymbol(chord, input.keyRoot, input.mode, "key"),
    inferred: true
  };
}

function symmetricDifferenceSize(left: Set<number>, right: Set<number>): number {
  let size = 0;
  for (const pitchClass of left) {
    if (!right.has(pitchClass)) {
      size += 1;
    }
  }
  for (const pitchClass of right) {
    if (!left.has(pitchClass)) {
      size += 1;
    }
  }
  return size;
}

function pitchDistance(
  soundingPitchClasses: Set<number>,
  templatePitchClasses: Set<number>
): number {
  let total = 0;
  for (const soundingPitchClass of soundingPitchClasses) {
    let nearest = 6;
    for (const templatePitchClass of templatePitchClasses) {
      const distance = Math.abs(soundingPitchClass - templatePitchClass);
      nearest = Math.min(nearest, distance, 12 - distance);
    }
    total += nearest;
  }
  return total;
}

function compareScores(left: InferenceScore, right: InferenceScore): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}
