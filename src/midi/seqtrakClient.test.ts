import { describe, expect, it, vi } from "vitest";
import { createDefaultPack, validatePack } from "../domain/music";
import {
  encodeParameterChange,
  encodeParameterRequest,
  encodeTrackChordAddress,
  encodeTrackSoundNameAddress,
  keyAddress,
  scaleAddress
} from "./seqtrakSysex";
import { MockMidiInput, MockMidiOutput } from "./mockMidi";
import { SeqtrakClient } from "./seqtrakClient";
import type { MidiOutputLike } from "./midiTypes";

describe("SeqtrakClient", () => {
  it("reads and validates the current key", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(() => {
      input.emit(encodeParameterChange(keyAddress(), 11));
    });
    const client = new SeqtrakClient(input, output);

    await expect(client.readCurrentKey()).resolves.toBe(11);
    client.dispose();
  });

  it("rejects an invalid current key", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(() => {
      input.emit(encodeParameterChange(keyAddress(), 12));
    });
    const client = new SeqtrakClient(input, output);

    await expect(client.readCurrentKey()).rejects.toThrow("SEQTRAK KEY must be an integer from 0 to 11.");
    client.dispose();
  });

  it("reads current scale by sending a parameter request", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput((sent) => {
      expect(sent).toEqual([0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7]);
      input.emit(encodeParameterChange(scaleAddress(), 3));
    });
    const client = new SeqtrakClient(input, output);

    await expect(client.readCurrentScale()).resolves.toBe(3);
    expect(input.listenerCount).toBe(1);
    client.dispose();
    expect(input.listenerCount).toBe(0);
  });

  it("reads a track sound name from bytes 0 through 0x63", async () => {
    const input = new MockMidiInput();
    const values = new Map<number, number>([
      [1, 0x50],
      [2, 0x61],
      [3, 0x64],
      [4, 0x00],
      [5, 0x58]
    ]);
    const requestedBytes: number[] = [];
    const output = new MockMidiOutput((sent) => {
      const byteIndex = sent[8];
      requestedBytes.push(byteIndex);
      input.emit(encodeParameterChange(encodeTrackSoundNameAddress(7, byteIndex), values.get(byteIndex) ?? 0));
    });
    const client = new SeqtrakClient(input, output);

    await expect(client.readTrackSoundName(7)).resolves.toBe("Pad");
    expect(requestedBytes).toEqual(Array.from({ length: 0x64 }, (_, index) => index));
  });

  it("reads seven chord slots for the selected scale and returns a valid pack", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput((sent) => {
      const address = [sent[6], sent[7], sent[8]] as const;
      if (sent.toString() === encodeParameterRequest(keyAddress()).toString()) {
        input.emit(encodeParameterChange(keyAddress(), 1));
        return;
      }
      const value = sent[8] === 0x00 ? 0x3c : sent[8] === 0x01 ? 0x40 : sent[8] === 0x02 ? 0x43 : 0x00;
      input.emit(encodeParameterChange(address, value));
    });
    const client = new SeqtrakClient(input, output);

    const pack = await client.readChordPack({ trackIndex: 7, scale: 0, trackSoundName: "Pad" });

    expect(pack.sourceTrackIndex).toBe(7);
    expect(pack.trackSoundName).toBe("Pad");
    expect(pack.chords).toHaveLength(7);
    expect(pack.chords[0].notes).toEqual([60, 64, 67]);
    expect(validatePack(pack)).toEqual([]);
    expect(output.sentMessages[0]).toEqual(encodeParameterRequest(keyAddress()));
  });

  it("writes all 28 chord parameters with off padding", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput((sent) => {
      if (sent.toString() === encodeParameterRequest(keyAddress()).toString()) {
        input.emit(encodeParameterChange(keyAddress(), 1));
      }
    });
    const client = new SeqtrakClient(input, output);
    const pack = {
      ...createDefaultPack(),
      chords: createDefaultPack().chords.map((chord) =>
        chord.slotIndex === 1 ? { ...chord, notes: [60, 64, 67] } : chord
      )
    };

    await client.writeChordPack({ trackIndex: 7, scale: 0, pack });

    expect(output.sentMessages).toHaveLength(29);
    expect(output.sentMessages[0]).toEqual(encodeParameterRequest(keyAddress()));
    expect(output.sentMessages.slice(1, 5)).toEqual([
      [0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x00, 0x3c, 0xf7],
      [0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x01, 0x40, 0xf7],
      [0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x02, 0x43, 0xf7],
      [0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x03, 0x00, 0xf7]
    ]);
    expect(output.sentMessages[28]).toEqual(
      encodeParameterChange(encodeTrackChordAddress({ trackIndex: 7, scale: 0, slotIndex: 7, noteIndex: 3 }), 0)
    );
  });

  it("rejects invalid packs before sending any chord parameters", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(() => {
      input.emit(encodeParameterChange(keyAddress(), 1));
    });
    const client = new SeqtrakClient(input, output);
    const invalid = {
      ...createDefaultPack(),
      chords: createDefaultPack().chords.map((chord) =>
        chord.slotIndex === 7 ? { ...chord, notes: [20] } : chord
      )
    };

    await expect(client.writeChordPack({ trackIndex: 7, scale: 0, pack: invalid })).rejects.toThrow(
      "Note 20 is outside the SEQTRAK chord range."
    );
    expect(output.sentMessages).toEqual([encodeParameterRequest(keyAddress())]);
  });

  it("times out and cleans up listeners when a requested parameter never responds", async () => {
    vi.useFakeTimers();
    try {
      const input = new MockMidiInput();
      const client = new SeqtrakClient(input, new MockMidiOutput(), { requestTimeoutMs: 10 });

      const request = client.readCurrentScale();
      const rejection = expect(request).rejects.toThrow("Timed out waiting for SEQTRAK response.");
      expect(input.listenerCount).toBe(1);
      await vi.advanceTimersByTimeAsync(10);

      await rejection;
      expect(input.listenerCount).toBe(1);
      client.dispose();
      expect(input.listenerCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans up listeners when sending a request throws", async () => {
    const input = new MockMidiInput();
    const output: MidiOutputLike = {
      id: "throwing-output",
      name: "Throwing Output",
      send: () => {
        throw new Error("MIDI output failed.");
      }
    };
    const client = new SeqtrakClient(input, output);

    await expect(client.readCurrentScale()).rejects.toThrow("MIDI output failed.");
    expect(input.listenerCount).toBe(1);
    client.dispose();
    expect(input.listenerCount).toBe(0);
  });

  it("ignores unmatched parameter change responses while waiting for the requested address", async () => {
    const input = new MockMidiInput();
    const output = new MockMidiOutput(() => {
      input.emit(encodeParameterChange(encodeTrackSoundNameAddress(7, 1), 0x7f));
      input.emit(encodeParameterChange(scaleAddress(), 5));
    });
    const client = new SeqtrakClient(input, output);

    await expect(client.readCurrentScale()).resolves.toBe(5);
  });

  it("routes unsolicited parameter changes by address and disposes its listener", () => {
    const input = new MockMidiInput();
    const client = new SeqtrakClient(input, new MockMidiOutput());
    const keys: number[] = [];
    const scales: number[] = [];

    client.subscribeParameter(keyAddress(), (value) => keys.push(value));
    client.subscribeParameter(scaleAddress(), (value) => scales.push(value));
    input.emit(encodeParameterChange(keyAddress(), 4));
    input.emit(encodeParameterChange(scaleAddress(), 6));

    expect(keys).toEqual([4]);
    expect(scales).toEqual([6]);
    expect(input.listenerCount).toBe(1);
    client.dispose();
    expect(input.listenerCount).toBe(0);
  });
});
