import { describe, expect, it } from "vitest";
import {
  canonicalChordKey,
  formatChordSymbol,
  parseChordSymbol
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

  it("formats canonical pitch classes with readable contextual spelling", () => {
    expect(formatChordSymbol({ root: 10, quality: "7" }, 5, "major", "key")).toBe("Bb7");
    expect(formatChordSymbol({ root: 3, quality: "maj9" }, 0, "major", "flat")).toBe("Ebmaj9");
    expect(formatChordSymbol({ root: 6, quality: "7#11" }, 7, "major", "sharp")).toBe("F#7#11");
  });

  it("deduplicates enharmonic spellings canonically", () => {
    expect(canonicalChordKey(parseChordSymbol("C#7")!))
      .toBe(canonicalChordKey(parseChordSymbol("Db7")!));
  });
});
