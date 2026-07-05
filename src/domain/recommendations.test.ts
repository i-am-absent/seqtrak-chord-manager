import { describe, expect, it } from "vitest";
import { getRecommendedChordNames, getVoicingVariations } from "./recommendations";

describe("recommendations", () => {
  it("returns key-relative next chord names", () => {
    const names = getRecommendedChordNames("C", "Cmaj7").map((item) => item.name);
    expect(names).toEqual(["Dm7", "G7", "Am7", "Fmaj7", "Em7", "A7"]);
  });

  it("transposes recommendations by key", () => {
    const names = getRecommendedChordNames("G", "Gmaj7").map((item) => item.name);
    expect(names).toEqual(["Am7", "D7", "Em7", "Cmaj7", "Bm7", "E7"]);
  });

  it("creates four voicing variations with one to four notes", () => {
    const variations = getVoicingVariations("C", "Dm7");
    expect(variations).toHaveLength(4);
    expect(variations[0].notes).toEqual([62, 65, 69, 72]);
    expect(variations.every((variation) => variation.notes.length >= 1)).toBe(true);
    expect(variations.every((variation) => variation.notes.length <= 4)).toBe(true);
  });

  it("normalizes flat root aliases for voicing variations", () => {
    const variations = getVoicingVariations("C", "Bbm7");
    expect(variations[0].notes).toEqual([70, 73, 77, 80]);
  });

  it("throws a clear error for malformed chord roots", () => {
    expect(() => getVoicingVariations("C", "H7")).toThrow(
      'Unsupported chord root in "H7". Expected A-G with optional # or b accidental.'
    );
  });

  it("normalizes sharp root aliases for voicing variations", () => {
    const variations = getVoicingVariations("C", "E#maj7");
    expect(variations[0].notes).toEqual([65, 69, 72, 76]);
  });
});
