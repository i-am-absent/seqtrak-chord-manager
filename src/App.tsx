import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPreviewEngine, type PreviewEngine } from "./audio/previewEngine";
import { ChordGrid } from "./components/ChordGrid";
import { DevicePanel, type DeviceStatus } from "./components/DevicePanel";
import { Keyboard88 } from "./components/Keyboard88";
import { MetadataPanel } from "./components/MetadataPanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { createEditorState, editorReducer } from "./domain/packEditor";
import {
  assertSeqtrakKeyOffset,
  createDefaultPack,
  relativeToAbsoluteNote,
  seqtrakTracks,
  type SeqtrakTrackIndex
} from "./domain/music";
import { createMidiAccessService } from "./midi/midiAccessService";
import type { MidiInputLike, MidiOutputLike } from "./midi/midiTypes";
import { SeqtrakClient } from "./midi/seqtrakClient";
import { keyAddress } from "./midi/seqtrakSysex";
import { readPackFromSeqtrak, writePackToSeqtrak } from "./midi/deviceWorkflow";

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, createEditorState(createDefaultPack()));
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("disconnected");
  const [midiInputs, setMidiInputs] = useState<MidiInputLike[]>([]);
  const [midiOutputs, setMidiOutputs] = useState<MidiOutputLike[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<SeqtrakTrackIndex>(7);
  const [currentScale, setCurrentScale] = useState<number | null>(null);
  const [seqtrakKeyOffset, setSeqtrakKeyOffset] = useState(0);
  const clientRef = useRef<SeqtrakClient | null>(null);
  const keyUnsubscribeRef = useRef<(() => void) | null>(null);
  const stateUnsubscribeRef = useRef<(() => void) | null>(null);
  const connectionGenerationRef = useRef(0);
  const previewEngineRef = useRef<PreviewEngine | null>(null);
  const getPreviewEngine = useCallback(() => {
    previewEngineRef.current ??= createPreviewEngine();
    return previewEngineRef.current;
  }, []);
  const selectedChord = state.pack.chords.find(
    (chord) => chord.slotIndex === state.selectedSlotIndex
  );

  const releaseClient = useCallback(() => {
    connectionGenerationRef.current += 1;
    stateUnsubscribeRef.current?.();
    stateUnsubscribeRef.current = null;
    keyUnsubscribeRef.current?.();
    keyUnsubscribeRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
    setSeqtrakKeyOffset(0);
  }, []);

  useEffect(() => releaseClient, [releaseClient]);

  if (!selectedChord) {
    throw new Error(`Selected slot ${state.selectedSlotIndex} does not exist in this pack.`);
  }

  const handleConnect = useCallback(async () => {
    let generation = 0;
    try {
      setDeviceStatus("busy");
      setCurrentScale(null);
      releaseClient();
      generation = connectionGenerationRef.current;
      const access = await createMidiAccessService().requestAccess();
      if (generation !== connectionGenerationRef.current) {
        return;
      }
      setMidiInputs(access.inputs);
      setMidiOutputs(access.outputs);

      const input = access.inputs[0];
      const output = access.outputs[0];

      if (!input || !output) {
        releaseClient();
        setCurrentScale(null);
        setDeviceStatus("error");
        dispatch({
          type: "setMessage",
          message: "SEQTRAK MIDI input/output ports were not found."
        });
        return;
      }

      const client = new SeqtrakClient(input, output);
      if (generation !== connectionGenerationRef.current) {
        client.dispose();
        return;
      }
      clientRef.current = client;
      const receiveKey = (value: number): boolean => {
        if (generation !== connectionGenerationRef.current) {
          return false;
        }
        try {
          assertSeqtrakKeyOffset(value);
          setSeqtrakKeyOffset(value);
          return true;
        } catch (error) {
          dispatch({
            type: "setMessage",
            message: error instanceof Error ? error.message : "Invalid SEQTRAK KEY."
          });
          return false;
        }
      };
      keyUnsubscribeRef.current = client.subscribeParameter(keyAddress(), receiveKey);
      stateUnsubscribeRef.current = access.subscribeStateChange((event) => {
        if (
          event.port.state === "disconnected" &&
          (event.port.id === input.id || event.port.id === output.id)
        ) {
          releaseClient();
          setCurrentScale(null);
          setDeviceStatus("disconnected");
        }
      });
      const initialKeyIsValid = receiveKey(await client.readCurrentKey());
      if (generation !== connectionGenerationRef.current) {
        return;
      }
      setDeviceStatus("connected");
      if (initialKeyIsValid) {
        dispatch({ type: "setMessage", message: "SEQTRAK connected." });
      }
    } catch (error) {
      if (generation !== connectionGenerationRef.current) {
        return;
      }
      releaseClient();
      setCurrentScale(null);
      setDeviceStatus(error instanceof Error && error.message.includes("Web MIDI") ? "unsupported" : "error");
      dispatch({
        type: "setMessage",
        message: error instanceof Error ? error.message : "Failed to connect SEQTRAK."
      });
    }
  }, [releaseClient]);

  const handleTrackChange = useCallback((trackIndex: SeqtrakTrackIndex) => {
    setSelectedTrackIndex(trackIndex);
    setCurrentScale(null);
    dispatch({ type: "setMessage", message: "Select Read from SEQTRAK before writing this track." });
  }, []);

  const handleRead = useCallback(async () => {
    const client = clientRef.current;
    const generation = connectionGenerationRef.current;
    if (!client) {
      return;
    }

    try {
      setDeviceStatus("busy");
      const result = await readPackFromSeqtrak(client, selectedTrackIndex);
      if (client !== clientRef.current || generation !== connectionGenerationRef.current) {
        return;
      }
      setCurrentScale(result.scale);
      dispatch({
        type: "replacePack",
        pack: result.pack,
        message: `Read ${result.pack.trackSoundName} at SCALE ${result.scale}.`
      });
      setDeviceStatus("connected");
    } catch (error) {
      if (client !== clientRef.current || generation !== connectionGenerationRef.current) {
        return;
      }
      setDeviceStatus(clientRef.current ? "connected" : "error");
      dispatch({
        type: "setMessage",
        message: error instanceof Error ? error.message : "Failed to read from SEQTRAK."
      });
    }
  }, [selectedTrackIndex]);

  const handleWrite = useCallback(async () => {
    const client = clientRef.current;
    const generation = connectionGenerationRef.current;
    if (!client || currentScale === null) {
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
      const result = await writePackToSeqtrak(client, {
        trackIndex: selectedTrackIndex,
        scale: currentScale,
        pack: state.pack
      });
      if (client !== clientRef.current || generation !== connectionGenerationRef.current) {
        return;
      }
      dispatch({
        type: "setMessage",
        message: result.verified ? "Write verified." : "Write sent, but verification did not match."
      });
      setDeviceStatus("connected");
    } catch (error) {
      if (client !== clientRef.current || generation !== connectionGenerationRef.current) {
        return;
      }
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
            keyOffset={seqtrakKeyOffset}
            selectedSlotIndex={state.selectedSlotIndex}
            onSelectSlot={(slotIndex) => dispatch({ type: "selectSlot", slotIndex })}
            onPreviewSlot={(slotIndex) => {
              const chord = state.pack.chords.find((candidate) => candidate.slotIndex === slotIndex);
              if (chord) {
                void getPreviewEngine().playChord(
                  chord.notes.map((note) => relativeToAbsoluteNote(note, seqtrakKeyOffset))
                );
              }
            }}
          />
        </div>

        {state.message ? (
          <p className="status-message" role="status">
            {state.message}
          </p>
        ) : null}

        <Keyboard88
          activeNotes={selectedChord.notes}
          keyOffset={seqtrakKeyOffset}
          onPreviewNote={(note) => {
            void getPreviewEngine().playNote(note);
          }}
          onToggleNote={(absoluteNote) =>
            dispatch({ type: "toggleNote", absoluteNote, keyOffset: seqtrakKeyOffset })
          }
        />

        <RecommendationPanel
          packKey={state.pack.key}
          currentChordName={selectedChord.displayName}
          onPreview={(notes) => {
            void getPreviewEngine().playChord(notes);
          }}
          onApply={(variation, chordName) =>
            dispatch({
              type: "replaceSelectedChordFromAbsolute",
              absoluteNotes: variation.notes,
              keyOffset: seqtrakKeyOffset,
              displayName: chordName
            })
          }
        />
      </section>
    </main>
  );
}
