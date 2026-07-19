export type ChordQuality =
  | "major" | "minor" | "dim" | "aug" | "sus2" | "sus4"
  | "maj7" | "m7" | "7" | "dim7" | "m7b5"
  | "maj9" | "m9" | "9" | "11" | "13"
  | "7b9" | "7#9" | "7#11" | "7b13" | "add9" | "6/9";

export type RecommendationMode = "major" | "minor";
export type SpellingHint = "key" | "flat" | "sharp";

export interface CanonicalChord {
  root: number;
  quality: ChordQuality;
}

export const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], maj9: [0, 4, 11, 14], m9: [0, 3, 10, 14],
  "9": [0, 4, 10, 14], "11": [0, 4, 10, 17], "13": [0, 4, 10, 21],
  "7b9": [0, 4, 10, 13], "7#9": [0, 4, 10, 15],
  "7#11": [0, 4, 10, 18], "7b13": [0, 4, 10, 20],
  add9: [0, 4, 7, 14], "6/9": [0, 4, 9, 14]
};

const ROOT_PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
  E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10,
  B: 11, Cb: 11, "B#": 0
};

const SUFFIX_QUALITY: readonly [string, ChordQuality][] = [
  ["7#11", "7#11"], ["7b13", "7b13"], ["m7b5", "m7b5"],
  ["maj9", "maj9"], ["dim7", "dim7"], ["add9", "add9"],
  ["maj7", "maj7"], ["min7", "m7"], ["sus2", "sus2"], ["sus4", "sus4"],
  ["7b9", "7b9"], ["7#9", "7#9"], ["aug", "aug"], ["dim", "dim"],
  ["min", "minor"], ["m9", "m9"], ["m7", "m7"], ["sus", "sus4"], ["6/9", "6/9"],
  ["13", "13"], ["11", "11"], ["9", "9"], ["7", "7"], ["m", "minor"],
  ["", "major"]
];

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "", minor: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
  maj7: "maj7", m7: "m7", "7": "7", dim7: "dim7", m7b5: "m7b5",
  maj9: "maj9", m9: "m9", "9": "9", "11": "11", "13": "13",
  "7b9": "7b9", "7#9": "7#9", "7#11": "7#11", "7b13": "7b13",
  add9: "add9", "6/9": "6/9"
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEY_ROOTS = new Set([3, 5, 8, 10]);

export function parseChordSymbol(symbol: string): CanonicalChord | null {
  const normalized = symbol.trim().replaceAll("♭", "b").replaceAll("♯", "#");
  const rootMatch = normalized.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!rootMatch) {
    return null;
  }

  const rootToken = `${rootMatch[1].toUpperCase()}${rootMatch[2]}`;
  const root = ROOT_PITCH_CLASS[rootToken];
  if (root === undefined) {
    return null;
  }

  const rawSuffix = rootMatch[3]
    .replace("ø7", "m7b5")
    .replace("°7", "dim7")
    .replace("°", "dim");

  for (const [suffix, quality] of SUFFIX_QUALITY) {
    if (!rawSuffix.startsWith(suffix)) {
      continue;
    }

    const remainder = rawSuffix.slice(suffix.length);
    if (remainder === "" || isSlashBass(remainder)) {
      return { root, quality };
    }
  }

  return null;
}

export function formatChordSymbol(
  chord: CanonicalChord,
  keyRoot: number,
  mode: RecommendationMode,
  spellingHint: SpellingHint
): string {
  void mode;
  const pitchClass = normalizePitchClass(chord.root);
  const useFlats = spellingHint === "flat"
    || (spellingHint === "key" && FLAT_KEY_ROOTS.has(normalizePitchClass(keyRoot)));
  const rootName = (useFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClass];
  return `${rootName}${QUALITY_SUFFIX[chord.quality]}`;
}

export function canonicalChordKey(chord: CanonicalChord): string {
  return `${normalizePitchClass(chord.root)}:${chord.quality}`;
}

function isSlashBass(remainder: string): boolean {
  const bassMatch = remainder.match(/^\/([A-Ga-g])([#b]?)$/);
  if (!bassMatch) {
    return false;
  }
  return ROOT_PITCH_CLASS[`${bassMatch[1].toUpperCase()}${bassMatch[2]}`] !== undefined;
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}
