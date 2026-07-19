import { describe, expect, it } from "vitest";
import {
  CHORD_INTERVALS,
  type CanonicalChord,
  type ChordQuality,
} from "./chordSymbols";
import {
  MAX_88_KEY_MIDI_NOTE,
  MIN_88_KEY_MIDI_NOTE,
  SEQTRAK_MAX_CHORD_NOTE,
  SEQTRAK_MIN_CHORD_NOTE,
} from "./music";
import { getChordVoicingVariations } from "./voicings";

function pitchClasses(notes: number[]): number[] {
  return notes.map((note) => ((note % 12) + 12) % 12);
}

function sortedPitchClasses(notes: number[]): number[] {
  return pitchClasses(notes).sort((left, right) => left - right);
}

describe("chord voicings", () => {
  it.each([
    ["maj9", [0, 4, 11, 2]],
    ["m9", [0, 3, 10, 2]],
    ["7b9", [0, 4, 10, 1]],
    ["7#11", [0, 4, 10, 6]],
    ["13", [0, 4, 10, 9]],
  ] as const)("uses a four-note shell for %s", (quality, expectedPitchClasses) => {
    const close = getChordVoicingVariations({ root: 0, quality }, 0)[0];

    expect(pitchClasses(close.notes)).toEqual(expectedPitchClasses);
    expect(close.notes).toHaveLength(4);
  });

  it("uses every quality's canonical template without inventing or dropping tones", () => {
    for (const [quality, intervals] of Object.entries(CHORD_INTERVALS) as [
      ChordQuality,
      readonly number[],
    ][]) {
      const chord: CanonicalChord = { root: 5, quality };
      const expected = intervals
        .map((interval) => (5 + interval) % 12)
        .sort((left, right) => left - right);

      for (const variation of getChordVoicingVariations(chord, 0)) {
        expect(sortedPitchClasses(variation.notes)).toEqual(expected);
        expect(variation.notes).toHaveLength(intervals.length);
      }
    }
  });

  it("constructs close, smooth, wide, and high placements deterministically", () => {
    const variations = getChordVoicingVariations({ root: 0, quality: "maj7" }, 0);

    expect(variations.map((variation) => variation.notes)).toEqual([
      [60, 64, 67, 71],
      [64, 67, 71, 72],
      [48, 64, 67, 71],
      [72, 76, 79, 83],
    ]);
  });

  it.each([0, 11])("returns four distinct valid variations at boundary KEY %i", (keyOffset) => {
    const variations = getChordVoicingVariations({ root: 11, quality: "7b13" }, keyOffset);
    const minimum = Math.max(MIN_88_KEY_MIDI_NOTE, SEQTRAK_MIN_CHORD_NOTE + keyOffset);
    const maximum = Math.min(MAX_88_KEY_MIDI_NOTE, SEQTRAK_MAX_CHORD_NOTE + keyOffset);

    expect(variations.map(({ variation, label }) => ({ variation, label }))).toEqual([
      { variation: 1, label: "close" },
      { variation: 2, label: "smooth" },
      { variation: 3, label: "wide" },
      { variation: 4, label: "high" },
    ]);
    expect(new Set(variations.map((item) => item.notes.join(","))).size).toBe(4);
    for (const variation of variations) {
      expect(
        variation.notes.every(
          (note) => Number.isInteger(note) && note >= minimum && note <= maximum,
        ),
      ).toBe(true);
      expect(new Set(variation.notes).size).toBe(variation.notes.length);
      expect(sortedPitchClasses(variation.notes)).toEqual([3, 7, 9, 11]);
    }
  });

  it("resolves a fitted close/high collision without changing the chord template", () => {
    const variations = getChordVoicingVariations({ root: 8, quality: "7b13" }, 0);

    expect(new Set(variations.map((item) => item.notes.join(","))).size).toBe(4);
    expect(variations[0].notes).not.toEqual(variations[3].notes);
    for (const variation of variations) {
      expect(sortedPitchClasses(variation.notes)).toEqual([0, 4, 6, 8]);
      expect(variation.notes.every((note) => note >= 36 && note <= 96)).toBe(true);
    }
  });

  it.each([-1, 12, 1.5, Number.NaN])("rejects invalid KEY offset %s", (keyOffset) => {
    expect(() => getChordVoicingVariations({ root: 0, quality: "major" }, keyOffset)).toThrow(
      "SEQTRAK KEY must be an integer from 0 to 11.",
    );
  });
});
