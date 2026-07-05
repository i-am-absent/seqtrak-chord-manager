import type { MidiInputLike, MidiOutputLike } from "./midiTypes";

interface MidiPortCollectionLike<T> {
  values(): IterableIterator<T>;
}

interface NavigatorMidiLike {
  requestMIDIAccess?: (options: { sysex: boolean }) => Promise<{
    inputs: MidiPortCollectionLike<MidiInputLike>;
    outputs: MidiPortCollectionLike<MidiOutputLike>;
  }>;
}

export interface MidiAccessResult {
  inputs: MidiInputLike[];
  outputs: MidiOutputLike[];
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
        outputs: Array.from(access.outputs.values())
      };
    }
  };
}
