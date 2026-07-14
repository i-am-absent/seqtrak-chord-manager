import { seqtrakTracks, type SeqtrakTrackIndex } from "../domain/music";
import { midiPortLabel } from "../midi/midiAccessService";
import type { MidiInputLike, MidiOutputLike } from "../midi/midiTypes";

export type DeviceStatus = "unsupported" | "disconnected" | "connected" | "busy" | "error";

interface DevicePanelProps {
  status: DeviceStatus;
  inputs: MidiInputLike[];
  outputs: MidiOutputLike[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedTrackIndex: SeqtrakTrackIndex;
  currentScale: number | null;
  canWrite: boolean;
  onConnect: () => void;
  onRead: () => void;
  onWrite: () => void;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
  onTrackChange: (trackIndex: SeqtrakTrackIndex) => void;
}

export function DevicePanel({
  status,
  inputs,
  outputs,
  selectedInputId,
  selectedOutputId,
  selectedTrackIndex,
  currentScale,
  canWrite,
  onConnect,
  onRead,
  onWrite,
  onInputChange,
  onOutputChange,
  onTrackChange
}: DevicePanelProps) {
  const isBusy = status === "busy";
  const canRead = status === "connected" && !isBusy;

  return (
    <section className="device-panel panel" aria-label="SEQTRAK device">
      <div className="device-actions">
        <button type="button" onClick={onConnect}>
          Connect SEQTRAK
        </button>
        <button type="button" onClick={onRead} disabled={!canRead}>
          Read from SEQTRAK
        </button>
        <button type="button" onClick={onWrite} disabled={!canRead || !canWrite}>
          Write to SEQTRAK
        </button>
      </div>

      <label className="device-port-select">
        Input Port
        <select
          value={selectedInputId}
          disabled={isBusy}
          onChange={(event) => onInputChange(event.target.value)}
        >
          <option value="">Select MIDI input</option>
          {inputs.map((port) => (
            <option key={port.id} value={port.id}>
              {midiPortLabel(port, "input")}
            </option>
          ))}
        </select>
      </label>

      <label className="device-port-select">
        Output Port
        <select
          value={selectedOutputId}
          disabled={isBusy}
          onChange={(event) => onOutputChange(event.target.value)}
        >
          <option value="">Select MIDI output</option>
          {outputs.map((port) => (
            <option key={port.id} value={port.id}>
              {midiPortLabel(port, "output")}
            </option>
          ))}
        </select>
      </label>

      <label className="device-track-select">
        Target track
        <select
          value={selectedTrackIndex}
          disabled={isBusy}
          onChange={(event) => onTrackChange(Number(event.target.value) as SeqtrakTrackIndex)}
        >
          {seqtrakTracks.map((track) => (
            <option key={track.index} value={track.index}>
              {track.name}
            </option>
          ))}
        </select>
      </label>

      <div className="device-readout" aria-label="SEQTRAK status">
        <span>Status: {status}</span>
        <span>Inputs: {inputs.length}</span>
        <span>Outputs: {outputs.length}</span>
        <span>Current SCALE: {currentScale ?? "unknown"}</span>
      </div>
    </section>
  );
}
