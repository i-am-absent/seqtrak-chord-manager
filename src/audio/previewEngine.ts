export interface PreviewEngine {
  playNote(note: number): Promise<void>;
  playChord(notes: number[]): Promise<void>;
}

export function noteToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export class NullPreviewEngine implements PreviewEngine {
  async playNote(_note: number): Promise<void> {
    return Promise.resolve();
  }

  async playChord(_notes: number[]): Promise<void> {
    return Promise.resolve();
  }
}

export class WebAudioPreviewEngine implements PreviewEngine {
  private context: AudioContext;

  constructor(context = new AudioContext()) {
    this.context = context;
  }

  async playNote(note: number): Promise<void> {
    await this.playChord([note]);
  }

  async playChord(notes: number[]): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    const now = this.context.currentTime;
    const duration = 0.7;

    for (const note of notes) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = noteToFrequency(note);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }
  }
}
