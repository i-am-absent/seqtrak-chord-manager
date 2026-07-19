import { describe, expect, it } from "vitest";
import {
  CHORD_INTERVALS,
  canonicalChordKey,
  formatChordSymbol,
  parseChordSymbol,
  type ChordQuality
} from "./chordSymbols";

describe("chord symbols", () => {
  it.each([
    ["C", { root: 0, quality: "major" }],
    ["Bbm7", { root: 10, quality: "m7" }],
    ["F#dim7", { root: 6, quality: "dim7" }],
    ["Gø7", { root: 7, quality: "m7b5" }],
    ["D♭7♯11", { root: 1, quality: "7#11" }],
    ["Am/C", { root: 9, quality: "minor" }],
    ["E6/9", { root: 4, quality: "6/9" }]
  ])("parses %s", (symbol, expected) => {
    expect(parseChordSymbol(symbol)).toEqual(expected);
  });

  it("returns null for unsupported text", () => {
    expect(parseChordSymbol("Mystery chord")).toBeNull();
  });

  it.each([
    ["Cmaj9", { root: 0, quality: "maj9" }],
    ["Cmin7", { root: 0, quality: "m7" }],
    ["Cdim7", { root: 0, quality: "dim7" }],
    ["C7#11", { root: 0, quality: "7#11" }],
    ["C6/9/G", { root: 0, quality: "6/9" }]
  ])("prefers the complete suffix when parsing ambiguous %s", (symbol, expected) => {
    expect(parseChordSymbol(symbol)).toEqual(expected);
  });

  it("formats canonical pitch classes with readable contextual spelling", () => {
    expect(formatChordSymbol({ root: 10, quality: "7" }, 5, "major", "key")).toBe("Bb7");
    expect(formatChordSymbol({ root: 3, quality: "maj9" }, 0, "major", "flat")).toBe("Ebmaj9");
    expect(formatChordSymbol({ root: 6, quality: "7#11" }, 7, "major", "sharp")).toBe("F#7#11");
  });

  it.each([
    [0, 8, "Ab"],
    [2, 10, "Bb"],
    [5, 1, "Db"],
    [7, 3, "Eb"]
  ])("uses flat diatonic spellings in minor key root %i", (keyRoot, chordRoot, expected) => {
    expect(formatChordSymbol({ root: chordRoot, quality: "major" }, keyRoot, "minor", "key"))
      .toBe(expected);
  });

  it.each([
    [4, 6, "F#"],
    [11, 3, "D#"],
    [1, 8, "G#"]
  ])("uses sharp diatonic spellings in minor key root %i", (keyRoot, chordRoot, expected) => {
    expect(formatChordSymbol({ root: chordRoot, quality: "major" }, keyRoot, "minor", "key"))
      .toBe(expected);
  });

  it("preserves explicit accidental hints independently of mode", () => {
    expect(formatChordSymbol({ root: 3, quality: "major" }, 0, "minor", "sharp"))
      .toBe("D#");
    expect(formatChordSymbol({ root: 6, quality: "major" }, 4, "minor", "flat"))
      .toBe("Gb");
  });

  it("deduplicates enharmonic spellings canonically", () => {
    expect(canonicalChordKey(parseChordSymbol("C#7")!))
      .toBe(canonicalChordKey(parseChordSymbol("Db7")!));
  });

  it("exports the complete interval contract", () => {
    expect(CHORD_INTERVALS).toEqual({
      major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
      sus2: [0, 2, 7], sus4: [0, 5, 7], maj7: [0, 4, 7, 11],
      m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], dim7: [0, 3, 6, 9],
      m7b5: [0, 3, 6, 10], maj9: [0, 4, 11, 14], m9: [0, 3, 10, 14],
      "9": [0, 4, 10, 14], "11": [0, 4, 10, 17], "13": [0, 4, 10, 21],
      "7b9": [0, 4, 10, 13], "7#9": [0, 4, 10, 15],
      "7#11": [0, 4, 10, 18], "7b13": [0, 4, 10, 20],
      add9: [0, 4, 7, 14], "6/9": [0, 4, 9, 14]
    });
  });

  it("formats every quality with its public display suffix", () => {
    const suffixes: Record<ChordQuality, string> = {
      major: "", minor: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
      maj7: "maj7", m7: "m7", "7": "7", dim7: "dim7", m7b5: "m7b5",
      maj9: "maj9", m9: "m9", "9": "9", "11": "11", "13": "13",
      "7b9": "7b9", "7#9": "7#9", "7#11": "7#11", "7b13": "7b13",
      add9: "add9", "6/9": "6/9"
    };

    for (const [quality, suffix] of Object.entries(suffixes) as [ChordQuality, string][]) {
      expect(formatChordSymbol({ root: 0, quality }, 0, "major", "sharp")).toBe(`C${suffix}`);
    }
  });
});
