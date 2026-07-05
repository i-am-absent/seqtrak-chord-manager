import { describe, expect, it } from "vitest";
import {
  createDefaultPack,
  isBlackKey,
  midiNoteName,
  validateChordNotes,
  validatePack
} from "./music";

describe("music domain", () => {
  it("names MIDI notes using octave numbers", () => {
    expect(midiNoteName(21)).toBe("A0");
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(108)).toBe("C8");
  });

  it("identifies black keys", () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });

  it("validates a chord as one to four MIDI notes", () => {
    expect(validateChordNotes([60])).toEqual([]);
    expect(validateChordNotes([])).toContain("Chord must contain at least one note.");
    expect(validateChordNotes([60, 64, 67, 71, 74])).toContain(
      "Chord must contain no more than four notes."
    );
    expect(validateChordNotes([20])).toContain("Note 20 is outside the 88-key range.");
    expect(validateChordNotes([60, 60])).toContain("Chord notes must be unique.");
  });

  it("rejects fractional notes", () => {
    expect(validateChordNotes([60.5])).toContain("Note 60.5 must be a finite integer.");
  });

  it("rejects NaN notes", () => {
    expect(validateChordNotes([NaN])).toContain("Note NaN must be a finite integer.");
  });

  it("creates a valid seven-slot default pack", () => {
    const pack = createDefaultPack();
    expect(pack.chords).toHaveLength(7);
    expect(validatePack(pack)).toEqual([]);
  });

  it("rejects duplicate slot indexes", () => {
    const pack = createDefaultPack();
    pack.chords = pack.chords.map((chord) => ({ ...chord, slotIndex: 1 }));

    expect(validatePack(pack)).toContain("Slot indexes must be unique.");
  });

  it("rejects missing slot indexes", () => {
    const pack = createDefaultPack();
    pack.chords = pack.chords.map((chord) =>
      chord.slotIndex === 7 ? { ...chord, slotIndex: 6 } : chord
    );

    expect(validatePack(pack)).toContain("Pack must include slots 1 through 7.");
  });
});
