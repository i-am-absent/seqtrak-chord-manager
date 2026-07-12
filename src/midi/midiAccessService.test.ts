import { describe, expect, it, vi } from "vitest";
import { createMidiAccessService } from "./midiAccessService";

describe("midiAccessService", () => {
  it("reports unsupported browsers", async () => {
    const service = createMidiAccessService({});

    await expect(service.requestAccess()).rejects.toThrow("This browser does not support Web MIDI.");
  });

  it("requests Web MIDI with sysex enabled and lists ports", async () => {
    const input = {
      id: "in-1",
      name: "SEQTRAK Input",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const output = {
      id: "out-1",
      name: "SEQTRAK Output",
      send: vi.fn()
    };
    const requestMIDIAccess = vi.fn().mockResolvedValue({
      inputs: new Map([[input.id, input]]),
      outputs: new Map([[output.id, output]])
    });
    const service = createMidiAccessService({ requestMIDIAccess });

    const access = await service.requestAccess();

    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: true });
    expect(access.inputs).toEqual([input]);
    expect(access.outputs).toEqual([output]);
  });

  it("forwards port state changes and removes the listener on unsubscribe", async () => {
    const listeners = new Set<(event: { port: { id: string; state?: "connected" | "disconnected" } }) => void>();
    const accessLike = {
      inputs: new Map(),
      outputs: new Map(),
      addEventListener: vi.fn((_type: "statechange", listener: typeof listeners extends Set<infer T> ? T : never) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: "statechange", listener: typeof listeners extends Set<infer T> ? T : never) => listeners.delete(listener))
    };
    const service = createMidiAccessService({ requestMIDIAccess: vi.fn().mockResolvedValue(accessLike) });
    const access = await service.requestAccess();
    const callback = vi.fn();

    const unsubscribe = access.subscribeStateChange(callback);
    const event = { port: { id: "mock-input", state: "disconnected" as const } };
    listeners.forEach((listener) => listener(event));

    expect(callback).toHaveBeenCalledWith(event);
    expect(listeners.size).toBe(1);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
