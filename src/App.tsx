import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPreviewEngine, type PreviewEngine } from "./audio/previewEngine";
import { ChordGrid } from "./components/ChordGrid";
import { DevicePanel, type DeviceStatus } from "./components/DevicePanel";
import { Keyboard88 } from "./components/Keyboard88";
import { MetadataPanel } from "./components/MetadataPanel";
import { PublishPackDialog } from "./components/PublishPackDialog";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { ResetEditorDialog } from "./components/ResetEditorDialog";
import { SharedPackBrowser } from "./components/SharedPackBrowser";
import { createEditorState, editorReducer } from "./domain/packEditor";
import {
  assertSeqtrakKeyOffset,
  createDefaultPack,
  relativeToAbsoluteNote,
  seqtrakTracks,
  type SeqtrakTrackIndex
} from "./domain/music";
import {
  createMidiAccessService,
  midiPortLabel,
  resolveMidiPortId
} from "./midi/midiAccessService";
import type { MidiInputLike, MidiOutputLike } from "./midi/midiTypes";
import { SeqtrakClient } from "./midi/seqtrakClient";
import { readPackFromSeqtrak, writePackToSeqtrak } from "./midi/deviceWorkflow";
import {
  editablePackFingerprint,
  toEditablePack,
  validateEditablePack
} from "./sharing/editablePack";
import {
  PackOwnershipPersistenceError,
  SharingConfigurationError,
  SharingResponseError,
  SharingServiceError,
  SharingValidationError
} from "./sharing/errors";
import type { PackRepository } from "./sharing/packRepository";
import { sharedPackToChordPack } from "./sharing/sharedPackToChordPack";
import { createSupabasePackRepository } from "./sharing/supabasePackRepository";
import type { EditablePack, PublicPack } from "./sharing/types";

export interface AppProps {
  packRepository?: PackRepository;
  createPackRepository?: () => PackRepository;
}

function createProductionPackRepository(): PackRepository {
  return createSupabasePackRepository(import.meta.env);
}

function publicationErrorMessage(error: unknown): string {
  if (error instanceof SharingValidationError) {
    return "The shared pack was rejected. Review its contents and try again.";
  }
  if (error instanceof SharingConfigurationError) {
    return "Shared pack publishing is not configured.";
  }
  if (error instanceof SharingResponseError) {
    return "The sharing service returned an invalid response. Please try again.";
  }
  if (error instanceof SharingServiceError) {
    return "Sharing is temporarily unavailable. Please try again.";
  }
  return "Failed to publish shared pack.";
}

const defaultEditableFingerprint = editablePackFingerprint(toEditablePack(createDefaultPack()));

export default function App({
  packRepository,
  createPackRepository = createProductionPackRepository
}: AppProps = {}) {
  const [state, dispatch] = useReducer(editorReducer, createEditorState(createDefaultPack()));
  const [activeView, setActiveView] = useState<"editor" | "shared-packs">("editor");
  const [publicationSnapshot, setPublicationSnapshot] = useState<EditablePack | null>(null);
  const [publicationSubmitting, setPublicationSubmitting] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const [publicationNotice, setPublicationNotice] = useState<{
    message: string;
    warning: boolean;
  } | null>(null);
  const [lastPublishedFingerprint, setLastPublishedFingerprint] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("disconnected");
  const [midiInputs, setMidiInputs] = useState<MidiInputLike[]>([]);
  const [midiOutputs, setMidiOutputs] = useState<MidiOutputLike[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");
  const [selectedOutputId, setSelectedOutputId] = useState("");
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<SeqtrakTrackIndex>(7);
  const [currentScale, setCurrentScale] = useState<number | null>(null);
  const [seqtrakKeyOffset, setSeqtrakKeyOffset] = useState(0);
  const repositoryRef = useRef<{
    source: PackRepository | (() => PackRepository);
    repository: PackRepository;
  } | null>(null);
  const getPackRepository = useCallback(() => {
    const source = packRepository ?? createPackRepository;
    if (repositoryRef.current?.source === source) {
      return repositoryRef.current.repository;
    }
    const repository = packRepository ?? createPackRepository();
    repositoryRef.current = { source, repository };
    return repository;
  }, [createPackRepository, packRepository]);
  const clientRef = useRef<SeqtrakClient | null>(null);
  const keyUnsubscribeRef = useRef<(() => void) | null>(null);
  const stateUnsubscribeRef = useRef<(() => void) | null>(null);
  const connectionGenerationRef = useRef(0);
  const publishTriggerRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const publicationGenerationRef = useRef(0);
  const publicationInFlightRef = useRef(false);
  const previewEngineRef = useRef<PreviewEngine | null>(null);
  const getPreviewEngine = useCallback(() => {
    previewEngineRef.current ??= createPreviewEngine();
    return previewEngineRef.current;
  }, []);
  const selectedChord = state.pack.chords.find(
    (chord) => chord.slotIndex === state.selectedSlotIndex
  );
  const currentEditablePack = useMemo(() => toEditablePack(state.pack), [state.pack]);
  const currentPublicationFingerprint = useMemo(
    () => editablePackFingerprint(currentEditablePack),
    [currentEditablePack]
  );
  const alreadyPublished = lastPublishedFingerprint === currentPublicationFingerprint;
  const resetAvailable =
    currentPublicationFingerprint !== defaultEditableFingerprint ||
    state.selectedSlotIndex !== 1 ||
    currentScale !== null;

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
  useEffect(() => () => {
    publicationGenerationRef.current += 1;
  }, []);

  if (!selectedChord) {
    throw new Error(`Selected slot ${state.selectedSlotIndex} does not exist in this pack.`);
  }

  const handleConnect = useCallback(async () => {
    let generation = 0;
    let input: MidiInputLike | undefined;
    let output: MidiOutputLike | undefined;
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

      const inputId = resolveMidiPortId(access.inputs, selectedInputId || null);
      const outputId = resolveMidiPortId(access.outputs, selectedOutputId || null);
      setSelectedInputId(inputId ?? "");
      setSelectedOutputId(outputId ?? "");

      if (!inputId || !outputId) {
        setDeviceStatus("disconnected");
        dispatch({
          type: "setMessage",
          message: "Select MIDI input and output ports, then connect again."
        });
        return;
      }

      input = access.inputs.find((port) => port.id === inputId);
      output = access.outputs.find((port) => port.id === outputId);

      if (!input || !output) {
        setDeviceStatus("disconnected");
        dispatch({
          type: "setMessage",
          message: "Select MIDI input and output ports, then connect again."
        });
        return;
      }

      const connectedInput = input;
      const connectedOutput = output;
      const client = new SeqtrakClient(connectedInput, connectedOutput);
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
      const receiveKeyError = (error: Error): void => {
        if (generation !== connectionGenerationRef.current) {
          return;
        }
        dispatch({ type: "setMessage", message: error.message });
      };
      keyUnsubscribeRef.current = client.subscribeCurrentKey(receiveKey, receiveKeyError);
      stateUnsubscribeRef.current = access.subscribeStateChange((event) => {
        if (
          event.port.state === "disconnected" &&
          (event.port.id === connectedInput.id || event.port.id === connectedOutput.id)
        ) {
          if (event.port.id === connectedInput.id) {
            setSelectedInputId("");
          }
          if (event.port.id === connectedOutput.id) {
            setSelectedOutputId("");
          }
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
      const detail = error instanceof Error ? error.message : "Failed to connect SEQTRAK.";
      dispatch({
        type: "setMessage",
        message: input && output
          ? `MIDI connection failed (Input: ${midiPortLabel(input, "input")}; Output: ${midiPortLabel(output, "output")}): ${detail}`
          : detail
      });
    }
  }, [releaseClient, selectedInputId, selectedOutputId]);

  const handlePortChange = useCallback((direction: "input" | "output", id: string) => {
    if (direction === "input") {
      setSelectedInputId(id);
    } else {
      setSelectedOutputId(id);
    }
    releaseClient();
    setCurrentScale(null);
    setDeviceStatus("disconnected");
    dispatch({
      type: "setMessage",
      message: "MIDI port selection changed. Connect again."
    });
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

  const handleLoadSharedPack = useCallback((pack: PublicPack) => {
    const confirmed = window.confirm(
      `Replace the current editor contents with “${pack.packName}”?`
    );
    if (!confirmed) {
      return;
    }
    setCurrentScale(null);
    dispatch({
      type: "replacePack",
      pack: sharedPackToChordPack(pack),
      message: `Loaded “${pack.packName}” from shared packs.`
    });
    setActiveView("editor");
  }, []);

  const handleDeletedSharedPack = useCallback((pack: PublicPack) => {
    const deletedFingerprint = editablePackFingerprint(
      toEditablePack(sharedPackToChordPack(pack))
    );
    setLastPublishedFingerprint((current) =>
      current === deletedFingerprint ? null : current
    );
  }, []);

  const handleOpenPublish = useCallback(() => {
    const next = toEditablePack(state.pack);
    const errors = validateEditablePack(next);
    if (errors.length) {
      dispatch({ type: "setMessage", message: errors[0] });
      return;
    }
    setPublicationError("");
    setPublicationSnapshot(next);
  }, [state.pack]);

  const handleCancelPublish = useCallback(() => {
    if (publicationInFlightRef.current) return;
    setPublicationError("");
    setPublicationSnapshot(null);
  }, []);

  const handleConfirmReset = useCallback(() => {
    setCurrentScale(null);
    setPublicationNotice(null);
    dispatch({
      type: "replacePack",
      pack: createDefaultPack(),
      message: "Editor reset to the default pack."
    });
    setResetDialogOpen(false);
  }, []);

  const completePublication = useCallback((next: EditablePack, warning: boolean) => {
    setLastPublishedFingerprint(editablePackFingerprint(next));
    setPublicationSubmitting(false);
    setPublicationError("");
    setPublicationSnapshot(null);
    setPublicationNotice({
      warning,
      message: warning
        ? `Published “${next.packName}”, but ownership could not be saved. This browser cannot update or delete it later.`
        : `Published “${next.packName}” to Shared Packs.`
    });
  }, []);

  const handleConfirmPublish = useCallback(async () => {
    if (!publicationSnapshot || publicationInFlightRef.current) return;
    const next = publicationSnapshot;
    const generation = ++publicationGenerationRef.current;
    publicationInFlightRef.current = true;
    setPublicationSubmitting(true);
    setPublicationError("");
    try {
      await getPackRepository().createPack(next);
      if (generation !== publicationGenerationRef.current) return;
      publicationInFlightRef.current = false;
      completePublication(next, false);
    } catch (error) {
      if (generation !== publicationGenerationRef.current) return;
      publicationInFlightRef.current = false;
      if (error instanceof PackOwnershipPersistenceError) {
        completePublication(next, true);
      } else {
        setPublicationSubmitting(false);
        setPublicationError(publicationErrorMessage(error));
      }
    }
  }, [completePublication, getPackRepository, publicationSnapshot]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">SEQTRAK</p>
          <h1>Chord Manager</h1>
        </div>
        <div className="top-actions">
          <nav className="view-switch" aria-label="Application view">
            <button
              type="button"
              aria-pressed={activeView === "editor"}
              onClick={() => setActiveView("editor")}
            >
              Editor
            </button>
            <button
              type="button"
              aria-pressed={activeView === "shared-packs"}
              onClick={() => setActiveView("shared-packs")}
            >
              Shared Packs
            </button>
          </nav>
          {activeView === "editor" ? (
            <div className="publish-trigger-group">
              <button
                className="reset-trigger"
                type="button"
                ref={resetTriggerRef}
                disabled={!resetAvailable || publicationSubmitting}
                onClick={() => setResetDialogOpen(true)}
              >
                Reset
              </button>
              <button
                className="publish-trigger"
                type="button"
                ref={publishTriggerRef}
                disabled={alreadyPublished}
                onClick={handleOpenPublish}
              >
                Publish
              </button>
              {alreadyPublished ? <span>This version is already shared.</span> : null}
            </div>
          ) : null}
        </div>
      </header>

      {activeView === "editor" ? (
        <section className="workspace" aria-label="Chord editor workspace">
        <DevicePanel
          status={deviceStatus}
          inputs={midiInputs}
          outputs={midiOutputs}
          selectedInputId={selectedInputId}
          selectedOutputId={selectedOutputId}
          selectedTrackIndex={selectedTrackIndex}
          currentScale={currentScale}
          canWrite={currentScale !== null}
          onConnect={handleConnect}
          onRead={handleRead}
          onWrite={handleWrite}
          onInputChange={(id) => handlePortChange("input", id)}
          onOutputChange={(id) => handlePortChange("output", id)}
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

        {publicationNotice ? (
          <div
            className={publicationNotice.warning
              ? "publication-notice warning"
              : "publication-notice"}
            role="status"
          >
            <span>{publicationNotice.message}</span>
            <button type="button" onClick={() => setActiveView("shared-packs")}>
              View Shared Packs
            </button>
          </div>
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
      ) : (
        <section
          className="shared-workspace"
          aria-label="Shared pack browser workspace"
        >
          <SharedPackBrowser
            getRepository={getPackRepository}
            onLoadPack={handleLoadSharedPack}
            onDeletedPack={handleDeletedSharedPack}
          />
        </section>
      )}
      {publicationSnapshot ? (
        <PublishPackDialog
          snapshot={publicationSnapshot}
          submitting={publicationSubmitting}
          error={publicationError}
          trigger={publishTriggerRef}
          onCancel={handleCancelPublish}
          onConfirm={() => void handleConfirmPublish()}
        />
      ) : null}
      {resetDialogOpen ? (
        <ResetEditorDialog
          trigger={resetTriggerRef}
          onCancel={() => setResetDialogOpen(false)}
          onConfirm={handleConfirmReset}
        />
      ) : null}
    </main>
  );
}
