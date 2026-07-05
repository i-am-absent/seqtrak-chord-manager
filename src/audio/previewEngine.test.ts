import { describe, expect, it, vi } from "vitest";
import { NullPreviewEngine, noteToFrequency } from "./previewEngine";

describe("preview engine", () => {
  it("converts MIDI notes to equal-tempered frequencies", () => {
    expect(noteToFrequency(69)).toBeCloseTo(440);
    expect(noteToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it("provides a null engine for tests and unsupported audio contexts", async () => {
    const engine = new NullPreviewEngine();
    const spy = vi.spyOn(engine, "playChord");
    await engine.playChord([60, 64, 67]);
    expect(spy).toHaveBeenCalledWith([60, 64, 67]);
  });
});
