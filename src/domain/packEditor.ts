import type { ChordPack, ChordSlot, KeyName } from "./music";
import { absoluteToRelativeNote, validateChordNotes, validatePack } from "./music";

export interface EditorState {
  pack: ChordPack;
  selectedSlotIndex: number;
  message: string;
}

export type EditorAction =
  | { type: "selectSlot"; slotIndex: number }
  | { type: "toggleNote"; absoluteNote: number; keyOffset: number }
  | {
      type: "updateMetadata";
      patch: Partial<Pick<ChordPack, "packName" | "authorName" | "tags" | "key">> & {
        key?: KeyName;
      };
    }
  | {
      type: "replaceSelectedChordFromAbsolute";
      absoluteNotes: number[];
      keyOffset: number;
      displayName: string;
    }
  | { type: "replacePack"; pack: ChordPack; message?: string }
  | { type: "setMessage"; message: string };

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
      return selectSlot(state, action.slotIndex);
    case "toggleNote":
      return toggleNote(state, absoluteToRelativeNote(action.absoluteNote, action.keyOffset));
    case "updateMetadata":
      return {
        ...state,
        pack: { ...state.pack, ...action.patch },
        message: ""
      };
    case "replaceSelectedChordFromAbsolute":
      return replaceSelectedChord(
        state,
        action.absoluteNotes.map((note) => absoluteToRelativeNote(note, action.keyOffset)),
        action.displayName
      );
    case "replacePack":
      return replacePack(state, action.pack, action.message);
    case "setMessage":
      return {
        ...state,
        message: action.message
      };
  }
}

function replacePack(state: EditorState, pack: ChordPack, message = ""): EditorState {
  const validationErrors = validatePack(pack);

  if (validationErrors.length > 0) {
    return {
      ...state,
      message: validationErrors[0]
    };
  }

  return {
    pack,
    selectedSlotIndex: 1,
    message
  };
}

function selectSlot(state: EditorState, slotIndex: number): EditorState {
  if (!hasSlot(state, slotIndex)) {
    return {
      ...state,
      message: `Slot ${slotIndex} does not exist in this pack.`
    };
  }

  return { ...state, selectedSlotIndex: slotIndex, message: "" };
}

function toggleNote(state: EditorState, note: number): EditorState {
  const selected = getSelectedChord(state);
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

  const validationErrors = validateChordNotes(nextNotes);
  if (validationErrors.length > 0) {
    return {
      ...state,
      message: validationErrors[0]
    };
  }

  return {
    ...state,
    pack: updateSelectedChord(state, nextNotes, selected.displayName),
    message: ""
  };
}

function replaceSelectedChord(
  state: EditorState,
  notes: number[],
  displayName: string
): EditorState {
  const nextNotes = [...notes].sort((a, b) => a - b);
  const validationErrors = validateChordNotes(nextNotes);

  if (validationErrors.length > 0) {
    return {
      ...state,
      message: validationErrors[0]
    };
  }

  return {
    ...state,
    pack: updateSelectedChord(state, nextNotes, displayName),
    message: ""
  };
}

function getSelectedChord(state: EditorState): ChordSlot {
  const selected = state.pack.chords.find((chord) => chord.slotIndex === state.selectedSlotIndex);

  if (!selected) {
    throw new Error(`Selected slot ${state.selectedSlotIndex} does not exist in this pack.`);
  }

  return selected;
}

function hasSlot(state: EditorState, slotIndex: number): boolean {
  return state.pack.chords.some((chord) => chord.slotIndex === slotIndex);
}

function updateSelectedChord(state: EditorState, notes: number[], displayName: string): ChordPack {
  return {
    ...state.pack,
    chords: state.pack.chords.map((chord) =>
      chord.slotIndex === state.selectedSlotIndex ? { ...chord, notes, displayName } : chord
    )
  };
}
