import { describe, expect, it } from "vitest";
import {
  absoluteToRelativeNote,
  assertSeqtrakKeyOffset,
  isAbsoluteNoteSelectable,
  relativeToAbsoluteNote,
  SEQTRAK_MAX_CHORD_NOTE,
  SEQTRAK_MIN_CHORD_NOTE,
  createDefaultPack,
  isBlackKey,
  midiNoteName,
  seqtrakTracks,
  validateChordNotes,
  validatePack
} from "./music";

describe("music domain", () => {
  it.each([0, 1, 11])("converts every relative note with KEY %i", (keyOffset) => {
    expect(relativeToAbsoluteNote(0x24, keyOffset)).toBe(0x24 + keyOffset);
    expect(relativeToAbsoluteNote(0x3c, keyOffset)).toBe(0x3c + keyOffset);
    expect(relativeToAbsoluteNote(0x60, keyOffset)).toBe(0x60 + keyOffset);
    expect(absoluteToRelativeNote(0x3c + keyOffset, keyOffset)).toBe(0x3c);
  });

  it("validates KEY and the derived selectable range", () => {
    expect(() => assertSeqtrakKeyOffset(0)).not.toThrow();
    expect(() => assertSeqtrakKeyOffset(11)).not.toThrow();
    expect(() => assertSeqtrakKeyOffset(12)).toThrow("SEQTRAK KEY must be an integer from 0 to 11.");
    expect(isAbsoluteNoteSelectable(SEQTRAK_MIN_CHORD_NOTE + 11, 11)).toBe(true);
    expect(isAbsoluteNoteSelectable(SEQTRAK_MAX_CHORD_NOTE + 11, 11)).toBe(true);
    expect(isAbsoluteNoteSelectable(SEQTRAK_MIN_CHORD_NOTE + 10, 11)).toBe(false);
  });

  it("validates stored notes against the configurable SEQTRAK-relative range", () => {
    expect(validateChordNotes([SEQTRAK_MIN_CHORD_NOTE, SEQTRAK_MAX_CHORD_NOTE])).toEqual([]);
    expect(validateChordNotes([SEQTRAK_MIN_CHORD_NOTE - 1])).toContain(
      `Note ${SEQTRAK_MIN_CHORD_NOTE - 1} is outside the SEQTRAK chord range.`
    );
  });

  it("names MIDI notes using octave numbers", () => {
    expect(midiNoteName(21)).toBe("A0");
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(108)).toBe("C8");
  });

  it("identifies black keys", () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });

  it("defines the SEQTRAK chord note range", () => {
    expect(SEQTRAK_MIN_CHORD_NOTE).toBe(0x24);
    expect(SEQTRAK_MAX_CHORD_NOTE).toBe(0x60);
  });

  it("defines the fixed SEQTRAK tracks", () => {
    expect(seqtrakTracks).toEqual([
      { index: 0, name: "KICK" },
      { index: 1, name: "SNARE" },
      { index: 2, name: "CLAP" },
      { index: 3, name: "HAT1" },
      { index: 4, name: "HAT2" },
      { index: 5, name: "PERC1" },
      { index: 6, name: "PERC2" },
      { index: 7, name: "SYNTH1" },
      { index: 8, name: "SYNTH2" },
      { index: 9, name: "DX" }
    ]);
  });

  it("validates a chord as one to four MIDI notes", () => {
    expect(validateChordNotes([60])).toEqual([]);
    expect(validateChordNotes([])).toContain("Chord must contain at least one note.");
    expect(validateChordNotes([60, 64, 67, 71, 74])).toContain(
      "Chord must contain no more than four notes."
    );
    expect(validateChordNotes([20])).toContain("Note 20 is outside the SEQTRAK chord range.");
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
