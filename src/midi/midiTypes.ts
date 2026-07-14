export type MidiPortConnectionState = "open" | "closed" | "pending";

export interface MidiMessageEventLike {
  data: Uint8Array;
}

export interface MidiInputLike {
  id: string;
  name: string | null;
  state?: MidiPortConnectionState;
  addEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
  removeEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
}

export interface MidiOutputLike {
  id: string;
  name: string | null;
  state?: MidiPortConnectionState;
  send(data: number[] | Uint8Array): void;
}
