import { describe, expect, it } from "vitest";
import { resolveSourceChord } from "./chordInference";

describe("source chord resolution", () => {
  it("trusts a supported chord symbol", () => {
    expect(resolveSourceChord({
      displayName: "Am/C", relativeNotes: [60, 64, 69], keyOffset: 0,
      keyRoot: 0, mode: "major"
    })).toMatchObject({ chord: { root: 9, quality: "minor" }, inferred: false });
  });

  it("infers from sounding notes after applying live KEY", () => {
    expect(resolveSourceChord({
      displayName: "Unknown", relativeNotes: [56, 59, 63], keyOffset: 1,
      keyRoot: 0, mode: "major"
    })).toMatchObject({ chord: { root: 9, quality: "minor" }, inferred: true, name: "Am" });
  });

  it("uses the lowest sounding note as the root tie-breaker", () => {
    expect(resolveSourceChord({
      displayName: "Unknown", relativeNotes: [60, 64], keyOffset: 0,
      keyRoot: 0, mode: "major"
    })!.chord.root).toBe(0);
  });

  it("uses the chord quality declaration order for otherwise tied candidates", () => {
    expect(resolveSourceChord({
      displayName: "Unknown", relativeNotes: [60, 64, 70, 71], keyOffset: 0,
      keyRoot: 0, mode: "major"
    })!.chord.quality).toBe("maj7");
  });
});
