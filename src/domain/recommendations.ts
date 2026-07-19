import { chromaticKeys, type KeyName } from "./music";
import {
  CHORD_INTERVALS,
  canonicalChordKey,
  formatChordSymbol,
  type CanonicalChord,
  type ChordQuality,
  type RecommendationMode,
  type SpellingHint
} from "./chordSymbols";
import { resolveSourceChord, type ResolvedSourceChord } from "./chordInference";

export type RecommendationCategory = "conventional" | "chromatic";

export type RecommendationRuleId =
  | "functional" | "circle-fifths" | "dominant-resolution" | "predominant-dominant"
  | "deceptive" | "relative" | "stepwise" | "common-tone"
  | "secondary-dominant" | "tritone-substitution" | "modal-interchange"
  | "chromatic-mediant" | "backdoor" | "neapolitan" | "common-tone-diminished"
  | "parallel-mode" | "altered-dominant" | "chromatic-semitone"
  | "functional-fallback" | "chromatic-fallback";

export interface ChordRecommendation {
  chord: CanonicalChord;
  name: string;
  reason: string;
  category: RecommendationCategory;
  ruleId: RecommendationRuleId;
}

export interface ChordRecommendationSet {
  source: ResolvedSourceChord | null;
  candidates: ChordRecommendation[];
}

export interface ChordRecommendationInput {
  keyRoot: number;
  mode: RecommendationMode;
  sourceDisplayName: string;
  sourceRelativeNotes: number[];
  keyOffset: number;
}

interface RuleContext {
  source: CanonicalChord;
  keyRoot: number;
  mode: RecommendationMode;
  sourceDegree: number;
}

interface RuleDefinition {
  id: Exclude<RecommendationRuleId, "functional-fallback" | "chromatic-fallback">;
  category: RecommendationCategory;
  reason: string;
  basePriority: number;
  spellingHint: SpellingHint;
  contextualPenalty: (context: RuleContext) => number;
  generate: (context: RuleContext) => readonly CanonicalChord[];
}

type RecommendationScore = readonly [
  contextualPriority: number,
  negativeSharedTones: number,
  voiceLeadingDistance: number,
  rootDistance: number,
  ruleOrder: number,
  root: number,
  qualityOrder: number
];

interface RankedRecommendation extends ChordRecommendation {
  score: RecommendationScore;
}

const SCALE_INTERVALS: Record<RecommendationMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};

const SCALE_QUALITIES: Record<RecommendationMode, readonly ChordQuality[]> = {
  major: ["major", "minor", "minor", "major", "major", "minor", "dim"],
  minor: ["minor", "dim", "major", "minor", "minor", "major", "major"]
};

const QUALITY_ORDER: readonly ChordQuality[] = [
  "major", "minor", "dim", "aug", "sus2", "sus4", "maj7", "m7", "7", "dim7",
  "m7b5", "maj9", "m9", "9", "11", "13", "7b9", "7#9", "7#11", "7b13",
  "add9", "6/9"
];

const majorLike = new Set<ChordQuality>(["major", "maj7", "maj9", "add9", "6/9"]);
const minorLike = new Set<ChordQuality>(["minor", "m7", "m9", "m7b5"]);
const dominantLike = new Set<ChordQuality>(["7", "9", "11", "13", "7b9", "7#9", "7#11", "7b13"]);

function diatonicChord(context: RuleContext, degree: number): CanonicalChord {
  const index = ((degree % 7) + 7) % 7;
  return {
    root: normalizePitchClass(context.keyRoot + SCALE_INTERVALS[context.mode][index]),
    quality: SCALE_QUALITIES[context.mode][index]
  };
}

const recommendationRules: readonly RuleDefinition[] = [
  {
    id: "functional", category: "conventional", reason: "Functional movement",
    basePriority: 0, spellingHint: "key", contextualPenalty: () => 0,
    generate: (context) => [diatonicChord(context, (context.sourceDegree + 3) % 7)]
  },
  {
    id: "circle-fifths", category: "conventional", reason: "Circle of fifths",
    basePriority: 1, spellingHint: "key", contextualPenalty: () => 0,
    generate: (context) => [{ root: normalizePitchClass(context.source.root + 5), quality: "7" }]
  },
  {
    id: "dominant-resolution", category: "conventional", reason: "Dominant resolution",
    basePriority: 2, spellingHint: "key",
    contextualPenalty: (context) => dominantLike.has(context.source.quality) ? -3 : 4,
    generate: (context) => [{
      root: normalizePitchClass(context.source.root + 5),
      quality: context.mode === "major" ? "major" : "minor"
    }]
  },
  {
    id: "predominant-dominant", category: "conventional", reason: "Predominant to dominant",
    basePriority: 3, spellingHint: "key",
    contextualPenalty: (context) => context.sourceDegree === 1 || context.sourceDegree === 3 ? -3 : 3,
    generate: (context) => [{ root: normalizePitchClass(context.keyRoot + 7), quality: "7" }]
  },
  {
    id: "deceptive", category: "conventional", reason: "Deceptive cadence",
    basePriority: 4, spellingHint: "key",
    contextualPenalty: (context) => dominantLike.has(context.source.quality) ? -3 : 3,
    generate: (context) => [diatonicChord(context, 5)]
  },
  {
    id: "relative", category: "conventional", reason: "Relative key",
    basePriority: 5, spellingHint: "key", contextualPenalty: () => 0,
    generate: (context) => [{
      root: normalizePitchClass(context.source.root + (minorLike.has(context.source.quality) ? 3 : 9)),
      quality: minorLike.has(context.source.quality) ? "major" : "minor"
    }]
  },
  {
    id: "stepwise", category: "conventional", reason: "Stepwise movement",
    basePriority: 6, spellingHint: "key",
    contextualPenalty: (context) => context.sourceDegree < 0 ? 2 : -2,
    generate: (context) => [diatonicChord(context, context.sourceDegree < 0 ? 1 : context.sourceDegree + 1)]
  },
  {
    id: "common-tone", category: "conventional", reason: "Common-tone motion",
    basePriority: 7, spellingHint: "key",
    contextualPenalty: (context) => context.source.quality === "dim7" ? -6 : 0,
    generate: (context) => [{
      root: normalizePitchClass(context.source.root + 4),
      quality: minorLike.has(context.source.quality) ? "m7" : "maj7"
    }]
  },
  {
    id: "secondary-dominant", category: "chromatic", reason: "Secondary dominant",
    basePriority: 0, spellingHint: "sharp", contextualPenalty: () => 0,
    generate: (context) => [{ root: normalizePitchClass(context.source.root + 2), quality: "7" }]
  },
  {
    id: "tritone-substitution", category: "chromatic", reason: "Tritone substitution",
    basePriority: 2, spellingHint: "flat",
    contextualPenalty: (context) => dominantLike.has(context.source.quality) ? -4 : 2,
    generate: (context) => [{ root: normalizePitchClass(context.source.root + 6), quality: "7" }]
  },
  {
    id: "modal-interchange", category: "chromatic", reason: "Modal interchange",
    basePriority: 2, spellingHint: "flat",
    contextualPenalty: (context) => majorLike.has(context.source.quality) ? -2 : 2,
    generate: (context) => [{ root: normalizePitchClass(context.keyRoot + 5), quality: "minor" }]
  },
  {
    id: "chromatic-mediant", category: "chromatic", reason: "Chromatic mediant",
    basePriority: 3, spellingHint: "flat",
    contextualPenalty: (context) => majorLike.has(context.source.quality) ? -2 : 1,
    generate: (context) => [{ root: normalizePitchClass(context.source.root + 4), quality: "major" }]
  },
  {
    id: "backdoor", category: "chromatic", reason: "Backdoor progression",
    basePriority: 4, spellingHint: "flat",
    contextualPenalty: (context) => dominantLike.has(context.source.quality) ? -3 : 1,
    generate: (context) => [{ root: normalizePitchClass(context.keyRoot + 10), quality: "7" }]
  },
  {
    id: "neapolitan", category: "chromatic", reason: "Neapolitan movement",
    basePriority: 5, spellingHint: "flat",
    contextualPenalty: (context) => context.sourceDegree === 0 ? -4 : 1,
    generate: (context) => [{ root: normalizePitchClass(context.keyRoot + 1), quality: "major" }]
  },
  {
    id: "common-tone-diminished", category: "chromatic", reason: "Common-tone diminished",
    basePriority: 6, spellingHint: "key",
    contextualPenalty: (context) => majorLike.has(context.source.quality) ? -3 : 1,
    generate: (context) => [{ root: context.source.root, quality: "dim7" }]
  },
  {
    id: "parallel-mode", category: "chromatic", reason: "Parallel mode",
    basePriority: 7, spellingHint: "key",
    contextualPenalty: (context) => minorLike.has(context.source.quality) ? -4 : 0,
    generate: (context) => [{
      root: context.source.root,
      quality: minorLike.has(context.source.quality) ? "major" : "minor"
    }]
  },
  {
    id: "altered-dominant", category: "chromatic", reason: "Altered dominant",
    basePriority: 8, spellingHint: "flat",
    contextualPenalty: (context) => dominantLike.has(context.source.quality) ? -7 : 0,
    generate: (context) => [{ root: normalizePitchClass(context.keyRoot + 7), quality: "7b9" }]
  },
  {
    id: "chromatic-semitone", category: "chromatic", reason: "Chromatic semitone",
    basePriority: 9, spellingHint: "sharp",
    contextualPenalty: (context) => context.source.quality === "dim7" ? -8 : 0,
    generate: (context) => [{
      root: normalizePitchClass(context.source.root + 1),
      quality: majorLike.has(context.source.quality) ? "major" : "minor"
    }]
  }
];

export function getChordRecommendations(
  input: ChordRecommendationInput
): ChordRecommendationSet {
  const source = resolveSourceChord({
    displayName: input.sourceDisplayName,
    relativeNotes: input.sourceRelativeNotes,
    keyOffset: input.keyOffset,
    keyRoot: input.keyRoot,
    mode: input.mode
  });
  if (!source) {
    return { source: null, candidates: [] };
  }

  const keyRoot = normalizePitchClass(input.keyRoot);
  const context: RuleContext = {
    source: source.chord,
    keyRoot,
    mode: input.mode,
    sourceDegree: findScaleDegree(source.chord.root, keyRoot, input.mode)
  };
  const sourceKey = canonicalChordKey(source.chord);
  const rankedByKey = new Map<string, RankedRecommendation>();

  recommendationRules.forEach((rule, ruleOrder) => {
    for (const chord of rule.generate(context)) {
      const normalizedChord = { ...chord, root: normalizePitchClass(chord.root) };
      const key = canonicalChordKey(normalizedChord);
      if (key === sourceKey) {
        continue;
      }
      const ranked = rankRecommendation(
        normalizedChord,
        rule.category,
        rule.id,
        rule.reason,
        rule.spellingHint,
        rule.basePriority + rule.contextualPenalty(context),
        ruleOrder,
        context
      );
      const previous = rankedByKey.get(key);
      if (!previous || compareScores(ranked.score, previous.score) < 0) {
        rankedByKey.set(key, ranked);
      }
    }
  });

  const conventional = sortedPool(rankedByKey, "conventional");
  const chromatic = sortedPool(rankedByKey, "chromatic");
  const usedKeys = new Set(rankedByKey.keys());
  fillFallbacks(conventional, "conventional", usedKeys, context, sourceKey);
  fillFallbacks(chromatic, "chromatic", usedKeys, context, sourceKey);

  const candidates: ChordRecommendation[] = [];
  for (let index = 0; index < 6; index += 1) {
    candidates.push(toPublicRecommendation(conventional[index]));
    candidates.push(toPublicRecommendation(chromatic[index]));
  }
  return { source, candidates };
}

function rankRecommendation(
  chord: CanonicalChord,
  category: RecommendationCategory,
  ruleId: RecommendationRuleId,
  reason: string,
  spellingHint: SpellingHint,
  priority: number,
  ruleOrder: number,
  context: RuleContext
): RankedRecommendation {
  const sourcePitchClasses = chordPitchClasses(context.source);
  const candidatePitchClasses = chordPitchClasses(chord);
  return {
    chord,
    name: formatChordSymbol(chord, context.keyRoot, context.mode, spellingHint),
    reason,
    category,
    ruleId,
    score: [
      priority + destinationFunctionPenalty(chord, context),
      -sharedToneCount(sourcePitchClasses, candidatePitchClasses),
      aggregateVoiceLeadingDistance(sourcePitchClasses, candidatePitchClasses),
      circularDistance(context.source.root, chord.root),
      ruleOrder,
      chord.root,
      QUALITY_ORDER.indexOf(chord.quality)
    ]
  };
}

function sortedPool(
  recommendations: Map<string, RankedRecommendation>,
  category: RecommendationCategory
): RankedRecommendation[] {
  return [...recommendations.values()]
    .filter((item) => item.category === category)
    .sort((left, right) => compareScores(left.score, right.score))
    .slice(0, 6);
}

function fillFallbacks(
  pool: RankedRecommendation[],
  category: RecommendationCategory,
  usedKeys: Set<string>,
  context: RuleContext,
  sourceKey: string
): void {
  const fallbacks: RankedRecommendation[] = [];
  for (let root = 0; root < 12; root += 1) {
    for (const quality of QUALITY_ORDER) {
      const chord = { root, quality };
      const key = canonicalChordKey(chord);
      if (key === sourceKey || usedKeys.has(key)) {
        continue;
      }
      fallbacks.push(rankRecommendation(
        chord,
        category,
        category === "conventional" ? "functional-fallback" : "chromatic-fallback",
        category === "conventional" ? "Functional voice leading" : "Chromatic voice leading",
        "key",
        100,
        recommendationRules.length,
        context
      ));
    }
  }
  fallbacks.sort((left, right) => compareScores(left.score, right.score));
  for (const fallback of fallbacks) {
    if (pool.length >= 6) {
      break;
    }
    const key = canonicalChordKey(fallback.chord);
    if (usedKeys.has(key)) {
      continue;
    }
    pool.push(fallback);
    usedKeys.add(key);
  }
}

function toPublicRecommendation(item: RankedRecommendation): ChordRecommendation {
  return {
    chord: item.chord,
    name: item.name,
    reason: item.reason,
    category: item.category,
    ruleId: item.ruleId
  };
}

function destinationFunctionPenalty(chord: CanonicalChord, context: RuleContext): number {
  const degree = findScaleDegree(chord.root, context.keyRoot, context.mode);
  if (degree < 0) {
    return 2;
  }
  return chord.quality === SCALE_QUALITIES[context.mode][degree] ? 0 : 1;
}

function findScaleDegree(root: number, keyRoot: number, mode: RecommendationMode): number {
  const interval = normalizePitchClass(root - keyRoot);
  return SCALE_INTERVALS[mode].indexOf(interval);
}

function chordPitchClasses(chord: CanonicalChord): readonly number[] {
  return [...new Set(CHORD_INTERVALS[chord.quality].map((interval) =>
    normalizePitchClass(chord.root + interval)
  ))];
}

function sharedToneCount(left: readonly number[], right: readonly number[]): number {
  const rightSet = new Set(right);
  return left.filter((pitchClass) => rightSet.has(pitchClass)).length;
}

function aggregateVoiceLeadingDistance(
  source: readonly number[],
  destination: readonly number[]
): number {
  return source.reduce((total, pitchClass) => {
    const nearest = Math.min(...destination.map((candidate) => circularDistance(pitchClass, candidate)));
    return total + nearest;
  }, 0);
}

function circularDistance(left: number, right: number): number {
  const direct = Math.abs(normalizePitchClass(left) - normalizePitchClass(right));
  return Math.min(direct, 12 - direct);
}

function compareScores(left: RecommendationScore, right: RecommendationScore): number {
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

export interface RecommendedChordName {
  name: string;
  reason: string;
}

export interface VoicingVariation {
  variation: number;
  label: string;
  notes: number[];
}

const majorScaleSemitones = [0, 2, 4, 5, 7, 9, 11];
const recommendationDegrees = [
  { degree: 2, suffix: "m7", reason: "Predominant movement" },
  { degree: 5, suffix: "7", reason: "Dominant movement" },
  { degree: 6, suffix: "m7", reason: "Relative minor color" },
  { degree: 4, suffix: "maj7", reason: "Subdominant lift" },
  { degree: 3, suffix: "m7", reason: "Soft mediant motion" },
  { degree: 6, suffix: "7", reason: "Secondary dominant color" }
];

const rootAliases: Record<string, KeyName> = {
  Cb: "B",
  "C#": "C#",
  Db: "C#",
  "D#": "D#",
  Eb: "D#",
  "E#": "F",
  Fb: "E",
  "F#": "F#",
  Gb: "F#",
  "G#": "G#",
  Ab: "G#",
  "A#": "A#",
  Bb: "A#",
  "B#": "C"
};

export function getRecommendedChordNames(
  key: KeyName,
  currentChordName: string
): RecommendedChordName[] {
  void currentChordName;
  return recommendationDegrees.map((candidate) => ({
    name: `${degreeName(key, candidate.degree)}${candidate.suffix}`,
    reason: candidate.reason
  }));
}

export function getVoicingVariations(key: KeyName, chordName: string): VoicingVariation[] {
  void key;
  const root = chordRootMidi(chordName);
  const quality = chordQuality(chordName);
  const tones =
    quality === "dominant" ? [0, 4, 7, 10] : quality === "minor" ? [0, 3, 7, 10] : [0, 4, 7, 11];

  return [
    { variation: 1, label: "close", notes: tones.map((interval) => root + interval) },
    {
      variation: 2,
      label: "smooth",
      notes: [root + tones[0], root + tones[2], root + tones[3], root + 12 + tones[1]]
    },
    {
      variation: 3,
      label: "wide",
      notes: [root - 12 + tones[0], root + tones[2], root + tones[3], root + 12 + tones[1]]
    },
    { variation: 4, label: "high", notes: tones.map((interval) => root + 12 + interval) }
  ];
}

function degreeName(key: KeyName, degree: number): KeyName {
  const rootIndex = chromaticKeys.indexOf(key);
  const semitone = majorScaleSemitones[degree - 1];
  return chromaticKeys[(rootIndex + semitone) % chromaticKeys.length];
}

function chordRootMidi(chordName: string): number {
  const rootName = parseChordRoot(chordName);
  const rootIndex = chromaticKeys.indexOf(rootName);
  return 60 + rootIndex;
}

function parseChordRoot(chordName: string): KeyName {
  const rootMatch = chordName.match(/^([A-G](?:#|b)?)(?![#b])/);
  if (!rootMatch) {
    throw new Error(
      `Unsupported chord root in "${chordName}". Expected A-G with optional # or b accidental.`
    );
  }

  const rootToken = rootMatch[1];
  if (isKeyName(rootToken)) {
    return rootToken;
  }

  return rootAliases[rootToken];
}

function isKeyName(rootToken: string): rootToken is KeyName {
  return chromaticKeys.includes(rootToken as KeyName);
}

function chordQuality(chordName: string): "major" | "minor" | "dominant" {
  if (chordName.includes("m") && !chordName.includes("maj")) {
    return "minor";
  }
  if (chordName.includes("7") && !chordName.includes("maj")) {
    return "dominant";
  }
  return "major";
}
