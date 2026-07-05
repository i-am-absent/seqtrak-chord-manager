import { useMemo, useReducer } from "react";
import { createPreviewEngine } from "./audio/previewEngine";
import { ChordGrid } from "./components/ChordGrid";
import { Keyboard88 } from "./components/Keyboard88";
import { MetadataPanel } from "./components/MetadataPanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { createEditorState, editorReducer } from "./domain/packEditor";
import { createDefaultPack } from "./domain/music";

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, createEditorState(createDefaultPack()));
  const previewEngine = useMemo(() => createPreviewEngine(), []);
  const selectedChord = state.pack.chords.find(
    (chord) => chord.slotIndex === state.selectedSlotIndex
  );

  if (!selectedChord) {
    throw new Error(`Selected slot ${state.selectedSlotIndex} does not exist in this pack.`);
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">SEQTRAK</p>
          <h1>Chord Manager</h1>
        </div>
        <div className="header-actions" aria-label="Device actions">
          <button type="button" disabled>
            Connect SEQTRAK
          </button>
          <button type="button" disabled>
            Read
          </button>
          <button type="button" disabled>
            Write
          </button>
          <div className="device-status">Browser-only mode</div>
        </div>
      </header>

      <section className="workspace" aria-label="Chord editor workspace">
        <div className="editor-top">
          <MetadataPanel
            pack={state.pack}
            onChange={(patch) => dispatch({ type: "updateMetadata", patch })}
          />
          <ChordGrid
            pack={state.pack}
            selectedSlotIndex={state.selectedSlotIndex}
            onSelectSlot={(slotIndex) => dispatch({ type: "selectSlot", slotIndex })}
          />
        </div>

        {state.message ? (
          <p className="status-message" role="status">
            {state.message}
          </p>
        ) : null}

        <Keyboard88
          activeNotes={selectedChord.notes}
          onPreviewNote={(note) => {
            void previewEngine.playNote(note);
          }}
          onToggleNote={(note) => dispatch({ type: "toggleNote", note })}
        />

        <RecommendationPanel
          packKey={state.pack.key}
          currentChordName={selectedChord.displayName}
          onPreview={(notes) => {
            void previewEngine.playChord(notes);
          }}
          onApply={(variation, chordName) =>
            dispatch({
              type: "replaceSelectedChord",
              notes: variation.notes,
              displayName: chordName
            })
          }
        />
      </section>
    </main>
  );
}
