import { chromaticKeys, type KeyName } from "./music";

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
  const root = chordRootMidi(key, chordName);
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

function chordRootMidi(key: KeyName, chordName: string): number {
  const rootMatch = chordName.match(/^[A-G]#?/);
  const rootName = (rootMatch?.[0] ?? key) as KeyName;
  const rootIndex = chromaticKeys.indexOf(rootName);
  return 60 + rootIndex;
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
