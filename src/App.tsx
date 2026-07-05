import { useCallback, useReducer, useRef, useState } from "react";
import { createPreviewEngine, type PreviewEngine } from "./audio/previewEngine";
import { ChordGrid } from "./components/ChordGrid";
import { DevicePanel, type DeviceStatus } from "./components/DevicePanel";
import { Keyboard88 } from "./components/Keyboard88";
import { MetadataPanel } from "./components/MetadataPanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { createEditorState, editorReducer } from "./domain/packEditor";
import { createDefaultPack, seqtrakTracks, type SeqtrakTrackIndex } from "./domain/music";
import { createMidiAccessService } from "./midi/midiAccessService";
import type { MidiInputLike, MidiOutputLike } from "./midi/midiTypes";
import { SeqtrakClient } from "./midi/seqtrakClient";
import { readPackFromSeqtrak, writePackToSeqtrak } from "./midi/deviceWorkflow";

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, createEditorState(createDefaultPack()));
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("disconnected");
  const [midiInputs, setMidiInputs] = useState<MidiInputLike[]>([]);
  const [midiOutputs, setMidiOutputs] = useState<MidiOutputLike[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<SeqtrakTrackIndex>(7);
  const [currentScale, setCurrentScale] = useState<number | null>(null);
  const clientRef = useRef<SeqtrakClient | null>(null);
  const previewEngineRef = useRef<PreviewEngine | null>(null);
  const getPreviewEngine = useCallback(() => {
    previewEngineRef.current ??= createPreviewEngine();
    return previewEngineRef.current;
  }, []);
  const selectedChord = state.pack.chords.find(
    (chord) => chord.slotIndex === state.selectedSlotIndex
  );

  if (!selectedChord) {
    throw new Error(`Selected slot ${state.selectedSlotIndex} does not exist in this pack.`);
  }

  const handleConnect = useCallback(async () => {
    try {
      setDeviceStatus("busy");
      setCurrentScale(null);
      const access = await createMidiAccessService().requestAccess();
      setMidiInputs(access.inputs);
      setMidiOutputs(access.outputs);

      const input = access.inputs[0];
      const output = access.outputs[0];

      if (!input || !output) {
        clientRef.current = null;
        setCurrentScale(null);
        setDeviceStatus("error");
        dispatch({
          type: "setMessage",
          message: "SEQTRAK MIDI input/output ports were not found."
        });
        return;
      }

      clientRef.current = new SeqtrakClient(input, output);
      setDeviceStatus("connected");
      dispatch({ type: "setMessage", message: "SEQTRAK connected." });
    } catch (error) {
      clientRef.current = null;
      setCurrentScale(null);
      setDeviceStatus(error instanceof Error && error.message.includes("Web MIDI") ? "unsupported" : "error");
      dispatch({
        type: "setMessage",
        message: error instanceof Error ? error.message : "Failed to connect SEQTRAK."
      });
    }
  }, []);

  const handleTrackChange = useCallback((trackIndex: SeqtrakTrackIndex) => {
    setSelectedTrackIndex(trackIndex);
    setCurrentScale(null);
    dispatch({ type: "setMessage", message: "Select Read from SEQTRAK before writing this track." });
  }, []);

  const handleRead = useCallback(async () => {
    if (!clientRef.current) {
      return;
    }

    try {
      setDeviceStatus("busy");
      const result = await readPackFromSeqtrak(clientRef.current, selectedTrackIndex);
      setCurrentScale(result.scale);
      dispatch({
        type: "replacePack",
        pack: result.pack,
        message: `Read ${result.pack.trackSoundName} at SCALE ${result.scale}.`
      });
      setDeviceStatus("connected");
    } catch (error) {
      setDeviceStatus(clientRef.current ? "connected" : "error");
      dispatch({
        type: "setMessage",
        message: error instanceof Error ? error.message : "Failed to read from SEQTRAK."
      });
    }
  }, [selectedTrackIndex]);

  const handleWrite = useCallback(async () => {
    if (!clientRef.current || currentScale === null) {
      return;
    }

    const confirmed = window.confirm(
      `Write all 7 chords to ${seqtrakTracks[selectedTrackIndex].name} at SCALE ${currentScale}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeviceStatus("busy");
      const result = await writePackToSeqtrak(clientRef.current, {
        trackIndex: selectedTrackIndex,
        scale: currentScale,
        pack: state.pack
      });
      dispatch({
        type: "setMessage",
        message: result.verified ? "Write verified." : "Write sent, but verification did not match."
      });
      setDeviceStatus("connected");
    } catch (error) {
      setDeviceStatus(clientRef.current ? "connected" : "error");
      dispatch({
        type: "setMessage",
        message: error instanceof Error ? error.message : "Failed to write to SEQTRAK."
      });
    }
  }, [currentScale, selectedTrackIndex, state.pack]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">SEQTRAK</p>
          <h1>Chord Manager</h1>
        </div>
      </header>

      <section className="workspace" aria-label="Chord editor workspace">
        <DevicePanel
          status={deviceStatus}
          inputs={midiInputs}
          outputs={midiOutputs}
          selectedTrackIndex={selectedTrackIndex}
          currentScale={currentScale}
          canWrite={currentScale !== null}
          onConnect={handleConnect}
          onRead={handleRead}
          onWrite={handleWrite}
          onTrackChange={handleTrackChange}
        />

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
            void getPreviewEngine().playNote(note);
          }}
          onToggleNote={(note) => dispatch({ type: "toggleNote", note })}
        />

        <RecommendationPanel
          packKey={state.pack.key}
          currentChordName={selectedChord.displayName}
          onPreview={(notes) => {
            void getPreviewEngine().playChord(notes);
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
