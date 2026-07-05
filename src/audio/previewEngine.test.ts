import { describe, expect, it, vi } from "vitest";
import {
  createPreviewEngine,
  NullPreviewEngine,
  noteToFrequency,
  WebAudioPreviewEngine,
} from "./previewEngine";

type FakeOscillator = {
  type: OscillatorType;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

type FakeGain = {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function createFakeAudioContext(state: AudioContextState = "running") {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const context = {
    get state() {
      return state;
    },
    currentTime: 1.5,
    destination: {},
    resume: vi.fn(async () => {
      state = "running";
    }),
    createOscillator: vi.fn(() => {
      const oscillator: FakeOscillator = {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn((node: FakeGain) => node),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain: FakeGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn((node: unknown) => node),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
  };

  return {
    context: context as unknown as AudioContext,
    oscillators,
    gains,
  };
}

describe("preview engine", () => {
  it("converts MIDI notes to equal-tempered frequencies", () => {
    expect(noteToFrequency(69)).toBeCloseTo(440);
    expect(noteToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it("provides a null engine for tests and unsupported audio contexts", async () => {
    const engine = new NullPreviewEngine();
    const spy = vi.spyOn(engine, "playChord");
    await expect(engine.playNote(60)).resolves.toBeUndefined();
    await expect(engine.playChord([60, 64, 67])).resolves.toBeUndefined();
    await engine.playChord([60, 64, 67]);
    expect(spy).toHaveBeenCalledWith([60, 64, 67]);
  });

  it("creates a null engine when Web Audio is unavailable", () => {
    const originalAudioContext = window.AudioContext;

    try {
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: undefined,
      });

      expect(createPreviewEngine()).toBeInstanceOf(NullPreviewEngine);
    } finally {
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: originalAudioContext,
      });
    }
  });

  it("creates a web audio engine when Web Audio is available", () => {
    const originalAudioContext = window.AudioContext;
    const fake = createFakeAudioContext();
    const AudioContextConstructor = vi.fn(function AudioContext() {
      return fake.context;
    });

    try {
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: AudioContextConstructor,
      });

      expect(createPreviewEngine()).toBeInstanceOf(WebAudioPreviewEngine);
      expect(AudioContextConstructor).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        value: originalAudioContext,
      });
    }
  });

  it("schedules playable notes with Web Audio settings", async () => {
    const fake = createFakeAudioContext();
    const engine = new WebAudioPreviewEngine(fake.context);

    await engine.playChord([60]);

    const oscillator = fake.oscillators[0];
    const gain = fake.gains[0];
    expect(oscillator.type).toBe("sawtooth");
    expect(oscillator.frequency.value).toBeCloseTo(261.63, 1);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 1.5);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.08,
      1.52,
    );
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.0001,
      2.2,
    );
    expect(oscillator.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(fake.context.destination);
    expect(oscillator.start).toHaveBeenCalledWith(1.5);
    expect(oscillator.stop).toHaveBeenCalledWith(2.2);
  });

  it("resumes a suspended context before scheduling notes", async () => {
    const fake = createFakeAudioContext("suspended");
    const engine = new WebAudioPreviewEngine(fake.context);

    await engine.playNote(69);

    expect(fake.context.resume).toHaveBeenCalledOnce();
    expect(fake.oscillators).toHaveLength(1);
  });

  it("disconnects audio nodes after playback ends", async () => {
    const fake = createFakeAudioContext();
    const engine = new WebAudioPreviewEngine(fake.context);

    await engine.playChord([60]);
    fake.oscillators[0].onended?.();

    expect(fake.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(fake.gains[0].disconnect).toHaveBeenCalledOnce();
  });

  it("skips non-finite notes when scheduling a chord", async () => {
    const fake = createFakeAudioContext();
    const engine = new WebAudioPreviewEngine(fake.context);

    await engine.playChord([60, Number.NaN, Number.POSITIVE_INFINITY, 64]);

    expect(fake.oscillators).toHaveLength(2);
    expect(fake.oscillators[0].frequency.value).toBeCloseTo(261.63, 1);
    expect(fake.oscillators[1].frequency.value).toBeCloseTo(329.63, 1);
  });
});
