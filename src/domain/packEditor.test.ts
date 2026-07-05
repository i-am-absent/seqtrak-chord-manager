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

  it("does not allow more than four notes", () => {
    const state = createEditorState(createDefaultPack());
    const withFourth = editorReducer(state, { type: "toggleNote", note: 72 });
    const blockedFifth = editorReducer(withFourth, { type: "toggleNote", note: 76 });
    expect(blockedFifth.pack.chords[0].notes).toEqual([60, 64, 67, 72]);
    expect(blockedFifth.message).toBe("A SEQTRAK chord can contain up to four notes.");
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
});
