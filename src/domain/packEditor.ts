import type { ChordPack, KeyName } from "./music";

export interface EditorState {
  pack: ChordPack;
  selectedSlotIndex: number;
  message: string;
}

export type EditorAction =
  | { type: "selectSlot"; slotIndex: number }
  | { type: "toggleNote"; note: number }
  | {
      type: "updateMetadata";
      patch: Partial<Pick<ChordPack, "packName" | "authorName" | "tags" | "key">> & {
        key?: KeyName;
      };
    }
  | { type: "replaceSelectedChord"; notes: number[]; displayName: string };

export function createEditorState(pack: ChordPack): EditorState {
  return {
    pack,
    selectedSlotIndex: 1,
    message: ""
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "selectSlot":
      return { ...state, selectedSlotIndex: action.slotIndex, message: "" };
    case "toggleNote":
      return toggleNote(state, action.note);
    case "updateMetadata":
      return {
        ...state,
        pack: { ...state.pack, ...action.patch },
        message: ""
      };
    case "replaceSelectedChord":
      return {
        ...state,
        pack: updateSelectedChord(state, action.notes, action.displayName),
        message: ""
      };
  }
}

function toggleNote(state: EditorState, note: number): EditorState {
  const selected = state.pack.chords[state.selectedSlotIndex - 1];
  const hasNote = selected.notes.includes(note);
  const nextNotes = hasNote
    ? selected.notes.filter((candidate) => candidate !== note)
    : [...selected.notes, note].sort((a, b) => a - b);

  if (!hasNote && selected.notes.length >= 4) {
    return {
      ...state,
      message: "A SEQTRAK chord can contain up to four notes."
    };
  }

  if (nextNotes.length === 0) {
    return {
      ...state,
      message: "A SEQTRAK chord must contain at least one note."
    };
  }

  return {
    ...state,
    pack: updateSelectedChord(state, nextNotes, selected.displayName),
    message: ""
  };
}

function updateSelectedChord(state: EditorState, notes: number[], displayName: string): ChordPack {
  return {
    ...state.pack,
    chords: state.pack.chords.map((chord) =>
      chord.slotIndex === state.selectedSlotIndex ? { ...chord, notes, displayName } : chord
    )
  };
}
