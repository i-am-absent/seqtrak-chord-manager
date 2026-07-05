import { describe, expect, it } from "vitest";
import { createDefaultPack } from "./music";
import { createEditorState, editorReducer } from "./packEditor";

describe("pack editor reducer", () => {
  it("selects a chord slot", () => {
    const state = createEditorState(createDefaultPack());
    const next = editorReducer(state, { type: "selectSlot", slotIndex: 4 });
    expect(next.selectedSlotIndex).toBe(4);
  });

  it("toggles notes while keeping sorted note order", () => {
    const state = createEditorState(createDefaultPack());
    const withoutC = editorReducer(state, { type: "toggleNote", note: 60 });
    expect(withoutC.pack.chords[0].notes).toEqual([64, 67]);
    const withHighC = editorReducer(withoutC, { type: "toggleNote", note: 72 });
    expect(withHighC.pack.chords[0].notes).toEqual([64, 67, 72]);
  });

  it("toggles the selected slot when chords are reordered", () => {
    const pack = createDefaultPack();
    pack.chords = [
      pack.chords[3],
      pack.chords[0],
      pack.chords[1],
      pack.chords[2],
      pack.chords[4],
      pack.chords[5],
      pack.chords[6]
    ];
    const state = editorReducer(createEditorState(pack), { type: "selectSlot", slotIndex: 4 });

    const next = editorReducer(state, { type: "toggleNote", note: 65 });

    expect(next.pack.chords.find((chord) => chord.slotIndex === 4)?.notes).toEqual([69, 72]);
    expect(next.pack.chords.find((chord) => chord.slotIndex === 3)?.notes).toEqual([64, 67, 71]);
  });

  it("does not allow more than four notes", () => {
    const state = createEditorState(createDefaultPack());
    const withFourth = editorReducer(state, { type: "toggleNote", note: 72 });
    const blockedFifth = editorReducer(withFourth, { type: "toggleNote", note: 76 });
    expect(blockedFifth.pack.chords[0].notes).toEqual([60, 64, 67, 72]);
    expect(blockedFifth.message).toBe("A SEQTRAK chord can contain up to four notes.");
  });

  it("rejects invalid toggled notes", () => {
    const state = createEditorState(createDefaultPack());

    const next = editorReducer(state, { type: "toggleNote", note: 109 });

    expect(next.pack).toBe(state.pack);
    expect(next.message).toBe("Note 109 is outside the 88-key range.");
  });

  it("does not allow removing the final remaining note", () => {
    const pack = createDefaultPack();
    pack.chords[0] = { ...pack.chords[0], notes: [60] };
    const state = createEditorState(pack);

    const next = editorReducer(state, { type: "toggleNote", note: 60 });

    expect(next.pack.chords[0].notes).toEqual([60]);
    expect(next.message).toBe("A SEQTRAK chord must contain at least one note.");
  });

  it("replaces the selected chord with sorted notes", () => {
    const state = createEditorState(createDefaultPack());

    const next = editorReducer(state, {
      type: "replaceSelectedChord",
      notes: [67, 60, 64],
      displayName: "C sorted"
    });

    expect(next.pack.chords[0].notes).toEqual([60, 64, 67]);
    expect(next.pack.chords[0].displayName).toBe("C sorted");
    expect(next.message).toBe("");
  });

  it("rejects invalid replacement notes and leaves the pack unchanged", () => {
    const state = createEditorState(createDefaultPack());

    const next = editorReducer(state, {
      type: "replaceSelectedChord",
      notes: [60, 60],
      displayName: "Duplicate C"
    });

    expect(next.pack).toBe(state.pack);
    expect(next.message).toBe("Chord notes must be unique.");
  });

  it("rejects invalid slot selection", () => {
    const state = createEditorState(createDefaultPack());

    const next = editorReducer(state, { type: "selectSlot", slotIndex: 99 });

    expect(next.selectedSlotIndex).toBe(1);
    expect(next.message).toBe("Slot 99 does not exist in this pack.");
  });

  it("updates pack metadata", () => {
    const state = createEditorState(createDefaultPack());
    const next = editorReducer(state, {
      type: "updateMetadata",
      patch: { packName: "House Lift", authorName: "moppy", tags: ["house"], key: "G" }
    });
    expect(next.pack.packName).toBe("House Lift");
    expect(next.pack.authorName).toBe("moppy");
    expect(next.pack.tags).toEqual(["house"]);
    expect(next.pack.key).toBe("G");
  });

  it("replaces the editable pack with an imported pack", () => {
    const imported = createDefaultPack();
    imported.packName = "Imported Chords";
    imported.trackSoundName = "SEQTRAK SYNTH1";
    imported.sourceTrackIndex = 7;
    imported.chords[0] = { slotIndex: 1, notes: [57, 60, 64], displayName: "Am/C" };

    const selectedState = editorReducer(createEditorState(createDefaultPack()), {
      type: "selectSlot",
      slotIndex: 4
    });
    const next = editorReducer(selectedState, {
      type: "replacePack",
      pack: imported,
      message: "Read SYNTH1."
    });

    expect(next.pack).toEqual(imported);
    expect(next.selectedSlotIndex).toBe(1);
    expect(next.message).toBe("Read SYNTH1.");
  });

  it("rejects an invalid imported pack and leaves the editor unchanged", () => {
    const state = createEditorState(createDefaultPack());
    const invalid = {
      ...createDefaultPack(),
      chords: createDefaultPack().chords.filter((chord) => chord.slotIndex !== 1)
    };

    const next = editorReducer(state, {
      type: "replacePack",
      pack: invalid,
      message: "Read SYNTH1."
    });

    expect(next.pack).toBe(state.pack);
    expect(next.selectedSlotIndex).toBe(1);
    expect(next.message).toBe("Pack must contain exactly seven chord slots.");
  });
});
