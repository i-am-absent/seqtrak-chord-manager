import type { MidiInputLike, MidiOutputLike } from "./midiTypes";

export interface MidiPortIdentity {
  id: string;
  name: string | null;
}

export function resolveMidiPortId<T extends MidiPortIdentity>(
  ports: readonly T[],
  selectedId: string | null
): string | null {
  if (selectedId && ports.some((port) => port.id === selectedId)) {
    return selectedId;
  }
  return ports.find((port) => port.name?.toUpperCase().startsWith("SEQTRAK"))?.id ?? null;
}

export function midiPortLabel(
  port: MidiPortIdentity,
  direction: "input" | "output"
): string {
  return port.name || `Unnamed MIDI ${direction}`;
}

interface MidiPortCollectionLike<T> {
  values(): IterableIterator<T>;
}

interface NavigatorMidiLike {
  requestMIDIAccess?: (options: { sysex: boolean }) => Promise<{
    inputs: MidiPortCollectionLike<MidiInputLike>;
    outputs: MidiPortCollectionLike<MidiOutputLike>;
    addEventListener(type: "statechange", listener: (event: MidiPortStateChangeEventLike) => void): void;
    removeEventListener(type: "statechange", listener: (event: MidiPortStateChangeEventLike) => void): void;
  }>;
}

export interface MidiPortStateChangeEventLike {
  port: { id: string; state?: "connected" | "disconnected" };
}

export interface MidiAccessResult {
  inputs: MidiInputLike[];
  outputs: MidiOutputLike[];
  subscribeStateChange(callback: (event: MidiPortStateChangeEventLike) => void): () => void;
}

export function createMidiAccessService(
  navigatorLike: NavigatorMidiLike = globalThis.navigator as NavigatorMidiLike
) {
  return {
    async requestAccess(): Promise<MidiAccessResult> {
      if (!navigatorLike.requestMIDIAccess) {
        throw new Error("This browser does not support Web MIDI.");
      }

      const access = await navigatorLike.requestMIDIAccess({ sysex: true });

      return {
        inputs: Array.from(access.inputs.values()),
        outputs: Array.from(access.outputs.values()),
        subscribeStateChange(callback) {
          access.addEventListener("statechange", callback);
          return () => access.removeEventListener("statechange", callback);
        }
      };
    }
  };
}
