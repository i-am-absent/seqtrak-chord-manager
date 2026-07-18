import { describe, expect, it } from "vitest";
import { createDefaultPack, type ChordPack } from "../domain/music";
import {
  editablePackFingerprint,
  toEditablePack,
  validateEditablePack
} from "./editablePack";
import type { EditablePack } from "./types";

function localPack(): ChordPack {
  return {
    ...createDefaultPack(),
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T00:00:00.000Z",
    reportedCount: 4,
    hidden: true,
    deleted: true,
    sourceTrackIndex: 8,
    tags: ["pop", "bright"]
  };
}

it("copies only editable fields and deeply clones mutable data", () => {
  const source = localPack();
  const result = toEditablePack(source);
  expect(result).toEqual({
    packName: "Untitled Pack",
    authorName: "Anonymous",
    tags: ["pop", "bright"],
    key: "C",
    trackSoundName: "Unknown sound",
    sourceTrackIndex: 8,
    chords: source.chords
  });
  for (const field of ["id", "createdAt", "reportedCount", "hidden", "deleted"]) {
    expect(result).not.toHaveProperty(field);
  }
  result.tags.push("local");
  result.chords[0].displayName = "Local";
  result.chords[0].notes.push(71);
  expect(source.tags).toEqual(["pop", "bright"]);
  expect(source.chords[0]).toEqual({ slotIndex: 1, notes: [60, 64, 67], displayName: "C" });
});

it("omits an absent source track", () => {
  const source = localPack();
  delete source.sourceTrackIndex;
  expect(toEditablePack(source)).not.toHaveProperty("sourceTrackIndex");
});

it("uses canonical content for changed and restored fingerprints", () => {
  const original = toEditablePack(localPack());
  const reordered = {
    chords: original.chords,
    trackSoundName: original.trackSoundName,
    key: original.key,
    tags: original.tags,
    authorName: original.authorName,
    packName: original.packName,
    sourceTrackIndex: original.sourceTrackIndex
  } as EditablePack;
  expect(editablePackFingerprint(reordered)).toBe(editablePackFingerprint(original));
  reordered.packName = "Changed";
  expect(editablePackFingerprint(reordered)).not.toBe(editablePackFingerprint(original));
  reordered.packName = original.packName;
  expect(editablePackFingerprint(reordered)).toBe(editablePackFingerprint(original));
});

describe("validateEditablePack", () => {
  const valid = () => toEditablePack(localPack());
  const malformed = (value: unknown) => value as EditablePack;

  it("accepts a valid snapshot", () => {
    expect(validateEditablePack(valid())).toEqual([]);
  });

  it.each([
    [(pack: EditablePack) => { pack.packName = ""; }, "Pack name is required."],
    [(pack: EditablePack) => { pack.authorName = " Author"; }, "Author must not start or end with a space."],
    [(pack: EditablePack) => { pack.trackSoundName = `${"🎹".repeat(100)}x`; }, "Track sound must contain no more than 100 code points."],
    [(pack: EditablePack) => { pack.tags = ["tag "]; }, "Tags must not start or end with a space."],
    [(pack: EditablePack) => { pack.chords[0].displayName = ""; }, "Chord name is required."],
    [(pack: EditablePack) => { pack.sourceTrackIndex = 10; }, "Source track must be an integer from 0 to 9."]
  ])("rejects an invalid shared field", (mutate, message) => {
    const pack = valid();
    mutate(pack);
    expect(validateEditablePack(pack)).toContain(message);
  });

  it("rejects excessive, duplicate, and overlong tags", () => {
    const tooMany = valid();
    tooMany.tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    expect(validateEditablePack(tooMany)).toContain("A shared pack can contain up to 10 tags.");
    const duplicate = valid();
    duplicate.tags = ["pop", "pop"];
    expect(validateEditablePack(duplicate)).toContain("Tags must be unique.");
    const overlong = valid();
    overlong.tags = ["🎹".repeat(31)];
    expect(validateEditablePack(overlong)).toContain("Tags must contain no more than 30 code points.");
  });

  it("rejects invalid key, slots, and notes", () => {
    const key = valid();
    key.key = "H" as EditablePack["key"];
    expect(validateEditablePack(key)).toContain("Key must be a chromatic note name.");
    const slots = valid();
    slots.chords = slots.chords.slice(0, 6);
    expect(validateEditablePack(slots)).toContain("Pack must contain exactly seven chord slots.");
    const notes = valid();
    notes.chords[0].notes = [];
    expect(validateEditablePack(notes)).toContain("Chord must contain at least one note.");
  });

  it("returns deterministic errors for malformed scalar values", () => {
    const pack = valid() as unknown as Record<string, unknown>;
    pack.packName = null;
    pack.authorName = 42;
    pack.trackSoundName = false;
    pack.key = null;

    expect(validateEditablePack(malformed(pack))).toEqual([
      "Pack name must be a string.",
      "Author must be a string.",
      "Track sound must be a string.",
      "Key must be a string."
    ]);
  });

  it("returns deterministic errors for malformed collections", () => {
    expect(validateEditablePack(malformed({ ...valid(), tags: null }))).toEqual([
      "Tags must be an array."
    ]);
    expect(validateEditablePack(malformed({ ...valid(), chords: null }))).toEqual([
      "Chords must be an array."
    ]);
    expect(validateEditablePack(malformed({ ...valid(), tags: ["pop", null, 4] }))).toEqual([
      "Tags must be strings."
    ]);
  });

  it("returns deterministic errors for malformed chord values", () => {
    const pack = valid();
    pack.chords[0] = null as unknown as EditablePack["chords"][number];
    pack.chords[1] = {
      slotIndex: "2",
      displayName: null,
      notes: [62, 65, 69]
    } as unknown as EditablePack["chords"][number];

    expect(validateEditablePack(pack)).toEqual([
      "Chord must be an object.",
      "Chord slot index must be a number.",
      "Chord name must be a string."
    ]);
  });

  it("returns deterministic errors for malformed notes values", () => {
    const missingCollection = valid();
    missingCollection.chords[0].notes = null as unknown as number[];
    expect(validateEditablePack(missingCollection)).toEqual([
      "Chord notes must be an array."
    ]);

    const invalidItems = valid();
    invalidItems.chords[0].notes = [60, "64", null] as unknown as number[];
    expect(validateEditablePack(invalidItems)).toEqual([
      "Chord notes must be numbers."
    ]);
  });

  it("deduplicates identical messages in first-seen order", () => {
    const pack = valid();
    pack.tags = [" ", " "];
    for (const chord of pack.chords) {
      chord.displayName = "";
      chord.notes = [];
    }

    expect(validateEditablePack(pack)).toEqual([
      "Tags must not start or end with a space.",
      "Chord name is required.",
      "Tags must be unique.",
      "Chord must contain at least one note."
    ]);
  });

  it("keeps domain checks when structurally safe fields have semantic errors", () => {
    const pack = valid();
    pack.packName = "";
    pack.chords = pack.chords.slice(0, 6);

    expect(validateEditablePack(pack)).toEqual([
      "Pack name is required.",
      "Pack must contain exactly seven chord slots.",
      "Pack must include slots 1 through 7."
    ]);
  });
});
