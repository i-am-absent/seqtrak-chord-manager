import type { MidiInputLike, MidiMessageEventLike, MidiOutputLike } from "./midiTypes";

type MidiMessageListener = (event: MidiMessageEventLike) => void;

export class MockMidiInput implements MidiInputLike {
  id = "mock-input";
  name = "Mock MIDI Input";
  state = "open" as const;

  private listeners = new Set<MidiMessageListener>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  addEventListener(type: "midimessage", listener: MidiMessageListener): void {
    if (type === "midimessage") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: "midimessage", listener: MidiMessageListener): void {
    if (type === "midimessage") {
      this.listeners.delete(listener);
    }
  }

  emit(data: number[] | Uint8Array): void {
    const event = { data: Uint8Array.from(data) };

    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }
}

export class MockMidiOutput implements MidiOutputLike {
  id = "mock-output";
  name = "Mock MIDI Output";
  state = "open" as const;
  sentMessages: number[][] = [];

  constructor(private onSend?: (data: number[]) => void) {}

  send(data: number[] | Uint8Array): void {
    const bytes = Array.from(data);

    this.sentMessages.push(bytes);
    this.onSend?.(bytes);
  }
}
