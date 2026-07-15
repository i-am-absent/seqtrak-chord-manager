import { describe, expect, it, vi } from "vitest";
import { createMidiAccessService, midiPortLabel, resolveMidiPortId } from "./midiAccessService";

it("prefers the first SEQTRAK-prefixed port over earlier loopbacks", () => {
  const ports = [
    { id: "loop-a", name: "Default App Loopback (A)" },
    { id: "loop-b", name: "Default App Loopback (B)" },
    { id: "seqtrak-1", name: "SEQTRAK-1" }
  ];
  expect(resolveMidiPortId(ports, null)).toBe("seqtrak-1");
});

it("matches the SEQTRAK prefix without case sensitivity", () => {
  expect(resolveMidiPortId([{ id: "device", name: "seqtrak-2" }], null)).toBe("device");
});

it("uses the first matching SEQTRAK port when names vary by case", () => {
  const ports = [
    { id: "first", name: "seqtrak-1" },
    { id: "second", name: "SeQtRaK-2" }
  ];

  expect(resolveMidiPortId(ports, null)).toBe("first");
});

it("preserves a valid manual choice and replaces a stale choice", () => {
  const ports = [
    { id: "manual", name: "Custom MIDI" },
    { id: "auto", name: "SEQTRAK-1" }
  ];
  expect(resolveMidiPortId(ports, "manual")).toBe("manual");
  expect(resolveMidiPortId(ports, "missing")).toBe("auto");
});

it("preserves a valid empty-string port ID", () => {
  const ports = [
    { id: "", name: "Custom MIDI" },
    { id: "auto", name: "SEQTRAK-1" }
  ];

  expect(resolveMidiPortId(ports, "")).toBe("");
});

it("does not fall back to the first arbitrary or unnamed port", () => {
  expect(resolveMidiPortId([
    { id: "loop", name: "Loopback" },
    { id: "unnamed", name: null }
  ], null)).toBeNull();
});

it("uses IDs to distinguish duplicate names and labels unnamed ports", () => {
  const ports = [
    { id: "same-1", name: "SEQTRAK-1" },
    { id: "same-2", name: "SEQTRAK-1" }
  ];
  expect(resolveMidiPortId(ports, "same-2")).toBe("same-2");
  expect(midiPortLabel({ id: "x", name: null }, "input")).toBe("Unnamed MIDI input");
  expect(midiPortLabel({ id: "x", name: null }, "output")).toBe("Unnamed MIDI output");
});

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
