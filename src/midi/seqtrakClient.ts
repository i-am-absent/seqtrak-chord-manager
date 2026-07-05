import {
  createDefaultPack,
  midiNoteName,
  validatePack,
  type ChordPack,
  type ChordSlot,
  type SeqtrakTrackIndex
} from "../domain/music";
import type { MidiInputLike, MidiMessageEventLike, MidiOutputLike } from "./midiTypes";
import {
  codeValueToNote,
  decodeParameterChange,
  decodeSoundName,
  encodeParameterChange,
  encodeParameterRequest,
  encodeTrackChordAddress,
  encodeTrackSoundNameAddress,
  noteToCodeValue,
  scaleAddress,
  type SysexAddress
} from "./seqtrakSysex";

interface SeqtrakClientOptions {
  requestTimeoutMs?: number;
}

interface ReadChordPackInput {
  trackIndex: SeqtrakTrackIndex;
  scale: number;
  trackSoundName: string;
}

interface WriteChordPackInput {
  trackIndex: SeqtrakTrackIndex;
  scale: number;
  pack: ChordPack;
}

const SOUND_NAME_BYTE_COUNT = 0x64;
const CHORD_SLOT_COUNT = 7;
const NOTES_PER_SLOT = 4;
const EMPTY_SLOT_FALLBACK_NOTE = 60;

export class SeqtrakClient {
  private requestTimeoutMs: number;

  constructor(
    private input: MidiInputLike,
    private output: MidiOutputLike,
    options: SeqtrakClientOptions = {}
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 800;
  }

  async readCurrentScale(): Promise<number> {
    const value = await this.requestParameter(scaleAddress());

    if (!Number.isInteger(value) || value < 0 || value > 7) {
      throw new Error(`SEQTRAK returned invalid SCALE ${value}.`);
    }

    return value;
  }

  async readTrackSoundName(trackIndex: SeqtrakTrackIndex): Promise<string> {
    const values: number[] = [];

    for (let byteIndex = 0; byteIndex < SOUND_NAME_BYTE_COUNT; byteIndex += 1) {
      values.push(await this.requestParameter(encodeTrackSoundNameAddress(trackIndex, byteIndex)));
    }

    return decodeSoundName(values);
  }

  async readChordPack(input: ReadChordPackInput): Promise<ChordPack> {
    const basePack = createDefaultPack();
    const chords: ChordSlot[] = [];

    for (let slotIndex = 1; slotIndex <= CHORD_SLOT_COUNT; slotIndex += 1) {
      const notes: number[] = [];

      for (let noteIndex = 0; noteIndex < NOTES_PER_SLOT; noteIndex += 1) {
        const address = encodeTrackChordAddress({
          trackIndex: input.trackIndex,
          scale: input.scale,
          slotIndex,
          noteIndex
        });
        const note = codeValueToNote(await this.requestParameter(address));

        if (note !== null) {
          notes.push(note);
        }
      }

      chords.push(createChordSlot(slotIndex, notes));
    }

    return {
      ...basePack,
      packName: `${input.trackSoundName} SCALE ${input.scale}`,
      trackSoundName: input.trackSoundName,
      sourceTrackIndex: input.trackIndex,
      chords
    };
  }

  async writeChordPack(input: WriteChordPackInput): Promise<void> {
    const validationErrors = validatePack(input.pack);

    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0]);
    }

    const messages = [];

    for (let slotIndex = 1; slotIndex <= CHORD_SLOT_COUNT; slotIndex += 1) {
      const chord = input.pack.chords.find((candidate) => candidate.slotIndex === slotIndex);

      if (!chord) {
        throw new Error(`Slot ${slotIndex} does not exist in this pack.`);
      }

      for (let noteIndex = 0; noteIndex < NOTES_PER_SLOT; noteIndex += 1) {
        messages.push(
          encodeParameterChange(
            encodeTrackChordAddress({
              trackIndex: input.trackIndex,
              scale: input.scale,
              slotIndex,
              noteIndex
            }),
            noteToCodeValue(chord?.notes[noteIndex] ?? null)
          )
        );
      }
    }

    for (const message of messages) {
      this.output.send(message);
    }
  }

  private requestParameter(address: SysexAddress): Promise<number> {
    return new Promise((resolve, reject) => {
      const listener = (event: MidiMessageEventLike) => {
        const decoded = decodeParameterChange(event.data);

        if (!decoded || !sameAddress(decoded.address, address)) {
          return;
        }

        cleanup();
        resolve(decoded.value);
      };

      const timeout = globalThis.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for SEQTRAK response."));
      }, this.requestTimeoutMs);

      const cleanup = () => {
        globalThis.clearTimeout(timeout);
        this.input.removeEventListener("midimessage", listener);
      };

      this.input.addEventListener("midimessage", listener);

      try {
        this.output.send(encodeParameterRequest(address));
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
}

function createChordSlot(slotIndex: number, notes: number[]): ChordSlot {
  const visibleNotes = notes.length > 0 ? notes : [EMPTY_SLOT_FALLBACK_NOTE];

  return {
    slotIndex,
    notes: visibleNotes,
    displayName: notes.length > 0 ? visibleNotes.map(midiNoteName).join(" ") : "Empty"
  };
}

function sameAddress(left: SysexAddress, right: SysexAddress): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}
