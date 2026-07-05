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
});
