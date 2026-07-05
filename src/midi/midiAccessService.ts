interface MidiMessageEventLike {
  data: Uint8Array;
}

interface MidiInputLike {
  id: string;
  name: string;
  addEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
  removeEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
}

interface MidiOutputLike {
  id: string;
  name: string;
  send(data: number[] | Uint8Array): void;
}

interface NavigatorMidiLike {
  requestMIDIAccess?: (options: { sysex: boolean }) => Promise<{
    inputs: Map<string, MidiInputLike>;
    outputs: Map<string, MidiOutputLike>;
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
