import { describe, expect, it } from "vitest";
import { createDefaultPack } from "../domain/music";
import { sharedPackToChordPack } from "./sharedPackToChordPack";
import type { PublicPack } from "./types";

function createPublicPack(): PublicPack {
  const pack = createDefaultPack();
  return {
    packName: "Community Keys",
    authorName: "Ada",
    tags: ["pop", "bright"],
    key: "D",
    trackSoundName: "Warm Pad",
    sourceTrackIndex: 8,
    chords: pack.chords,
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T01:00:00.000Z",
    reportedCount: 3
  };
}

describe("sharedPackToChordPack", () => {
  it("copies only editable fields and applies local defaults", () => {
    const result = sharedPackToChordPack(createPublicPack());

    expect(result).toEqual({
      packName: "Community Keys",
      authorName: "Ada",
      tags: ["pop", "bright"],
      key: "D",
      trackSoundName: "Warm Pad",
      sourceTrackIndex: 8,
      chords: expect.any(Array),
      reportedCount: 0,
      hidden: false,
      deleted: false
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("deep-clones tags, chord slots, and note arrays", () => {
    const source = createPublicPack();
    const result = sharedPackToChordPack(source);

    result.tags.push("local");
    result.chords[0].displayName = "Local edit";
    result.chords[0].notes.push(71);

    expect(source.tags).toEqual(["pop", "bright"]);
    expect(source.chords[0].displayName).not.toBe("Local edit");
    expect(source.chords[0].notes).not.toContain(71);
  });
});
