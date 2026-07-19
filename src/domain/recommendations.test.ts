import { describe, expect, it } from "vitest";
import { canonicalChordKey } from "./chordSymbols";
import { getChordRecommendations } from "./recommendations";

const recommendationInput = {
  keyRoot: 0,
  mode: "major" as const,
  sourceDisplayName: "Cmaj7",
  sourceRelativeNotes: [60, 64, 67, 71],
  keyOffset: 0
};

describe("recommendations", () => {
  it("returns twelve balanced canonical candidates in alternating category order", () => {
    const result = getChordRecommendations(recommendationInput);

    expect(result.candidates).toHaveLength(12);
    expect(new Set(result.candidates.map((item) => canonicalChordKey(item.chord))).size).toBe(12);
    expect(result.candidates.map((item) => item.category)).toEqual([
      "conventional", "chromatic", "conventional", "chromatic",
      "conventional", "chromatic", "conventional", "chromatic",
      "conventional", "chromatic", "conventional", "chromatic"
    ]);
    expect(result.candidates.some((item) => canonicalChordKey(item.chord) === "0:maj7")).toBe(false);
  });

  it("uses the source chord to change the ordered recommendations", () => {
    const c = getChordRecommendations(recommendationInput);
    const g = getChordRecommendations({
      ...recommendationInput,
      sourceDisplayName: "G7",
      sourceRelativeNotes: [67, 71, 74, 77]
    });

    expect(c.candidates.map((item) => item.name)).not.toEqual(
      g.candidates.map((item) => item.name)
    );
  });

  it("changes deterministically with key and mode", () => {
    const major = getChordRecommendations(recommendationInput).candidates.map((item) => item.name);
    const minor = getChordRecommendations({
      ...recommendationInput,
      mode: "minor"
    }).candidates.map((item) => item.name);
    const transposed = getChordRecommendations({
      ...recommendationInput,
      keyRoot: 5
    }).candidates.map((item) => item.name);

    expect(minor).not.toEqual(major);
    expect(transposed).not.toEqual(major);
    expect(getChordRecommendations(recommendationInput).candidates.map((item) => item.name)).toEqual(major);
  });

  it("keeps contextual rule priority ahead of destination function and voice leading", () => {
    const chromaticRuleIds = getChordRecommendations({
      ...recommendationInput,
      sourceDisplayName: "Db7"
    }).candidates
      .filter((item) => item.category === "chromatic")
      .map((item) => item.ruleId);

    expect(chromaticRuleIds.indexOf("secondary-dominant")).toBeLessThan(
      chromaticRuleIds.indexOf("altered-dominant")
    );
  });

  it("uses dominant qualities for every dominant-producing rule family", () => {
    const dominantRuleIds = new Set([
      "circle-fifths", "predominant-dominant", "secondary-dominant",
      "tritone-substitution", "backdoor", "altered-dominant"
    ]);
    const fixtures = ["Cmaj7", "Dm7", "G7", "Db7", "F#dim7"];
    const dominantCandidates = fixtures.flatMap((sourceDisplayName) =>
      getChordRecommendations({ ...recommendationInput, sourceDisplayName }).candidates
    ).filter((item) => dominantRuleIds.has(item.ruleId));

    expect(new Set(dominantCandidates.map((item) => item.ruleId))).toEqual(dominantRuleIds);
    expect(dominantCandidates.every((item) =>
      ["7", "9", "13", "7b9", "7#9", "7#11", "7b13"].includes(item.chord.quality)
    )).toBe(true);
  });

  it("uses the selected mode's scale quality for functional destinations", () => {
    const majorFunctional = getChordRecommendations(recommendationInput).candidates
      .find((item) => item.ruleId === "functional");
    const minorFunctional = getChordRecommendations({
      ...recommendationInput,
      mode: "minor"
    }).candidates.find((item) => item.ruleId === "functional");

    expect(majorFunctional?.chord).toEqual({ root: 5, quality: "major" });
    expect(minorFunctional?.chord).toEqual({ root: 5, quality: "minor" });
  });

  it("covers every named conventional and chromatic rule family across fixtures", () => {
    const fixtures = ["Cmaj7", "Dm7", "G7", "Abmaj7", "F#dim7"];
    const ids = new Set(fixtures.flatMap((sourceDisplayName) =>
      getChordRecommendations({ ...recommendationInput, sourceDisplayName })
        .candidates.map((item) => item.ruleId)
    ));

    for (const id of [
      "functional", "circle-fifths", "dominant-resolution", "predominant-dominant",
      "deceptive", "relative", "stepwise", "common-tone", "secondary-dominant",
      "tritone-substitution", "modal-interchange", "chromatic-mediant", "backdoor",
      "neapolitan", "common-tone-diminished", "parallel-mode", "altered-dominant",
      "chromatic-semitone"
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("returns concise reasons without exposing internal scores", () => {
    const candidates = getChordRecommendations(recommendationInput).candidates;

    expect(candidates.every((item) => item.reason.length > 0 && item.reason.length <= 32)).toBe(true);
    expect(candidates.every((item) => !("score" in item))).toBe(true);
  });

  it("uses note inference when the source symbol is unsupported", () => {
    const result = getChordRecommendations({
      ...recommendationInput,
      sourceDisplayName: "unknown"
    });

    expect(result.source).toMatchObject({ inferred: true, name: "Cmaj7" });
    expect(result.candidates).toHaveLength(12);
  });

  it("prefers a new quality family when base musical ranking axes tie", () => {
    const chromatic = getChordRecommendations({
      ...recommendationInput,
      sourceDisplayName: "Csus2",
      keyRoot: 1,
      mode: "major",
    }).candidates.filter((item) => item.category === "chromatic");

    expect(chromatic.slice(0, 3).map((item) => item.ruleId)).toEqual([
      "secondary-dominant",
      "modal-interchange",
      "tritone-substitution",
    ]);
  });

});
