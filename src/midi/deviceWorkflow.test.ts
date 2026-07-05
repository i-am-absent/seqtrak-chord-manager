import { describe, expect, it } from "vitest";
import { createDefaultPack, type ChordPack, type SeqtrakTrackIndex } from "../domain/music";
import { readPackFromSeqtrak, writePackToSeqtrak } from "./deviceWorkflow";

describe("deviceWorkflow", () => {
  it("reads scale, sound name, and pack", async () => {
    const calls: string[] = [];
    const client = {
      readCurrentScale: async () => {
        calls.push("scale");
        return 2;
      },
      readTrackSoundName: async (trackIndex: SeqtrakTrackIndex) => {
        calls.push(`sound:${trackIndex}`);
        return "Warm Pad";
      },
      readChordPack: async (input: {
        trackIndex: SeqtrakTrackIndex;
        scale: number;
        trackSoundName: string;
      }): Promise<ChordPack> => {
        calls.push(`pack:${input.trackIndex}:${input.scale}:${input.trackSoundName}`);
        return {
          ...createDefaultPack(),
          trackSoundName: input.trackSoundName,
          sourceTrackIndex: input.trackIndex
        };
      }
    };

    const result = await readPackFromSeqtrak(client, 7);

    expect(calls).toEqual(["scale", "sound:7", "pack:7:2:Warm Pad"]);
    expect(result.scale).toBe(2);
    expect(result.pack.trackSoundName).toBe("Warm Pad");
  });

  it("writes then verifies by reading back", async () => {
    const pack = createDefaultPack();
    const calls: string[] = [];
    const client = {
      writeChordPack: async () => {
        calls.push("write");
      },
      readChordPack: async () => {
        calls.push("readback");
        return pack;
      }
    };

    await expect(writePackToSeqtrak(client, { trackIndex: 7, scale: 0, pack })).resolves.toEqual({
      verified: true
    });
    expect(calls).toEqual(["write", "readback"]);
  });

  it("reports verification mismatch when readback chords differ", async () => {
    const pack = createDefaultPack();
    const readback = {
      ...pack,
      chords: pack.chords.map((chord) =>
        chord.slotIndex === 1 ? { ...chord, notes: [61, 64, 67] } : chord
      )
    };
    const client = {
      writeChordPack: async () => {},
      readChordPack: async () => readback
    };

    await expect(writePackToSeqtrak(client, { trackIndex: 7, scale: 0, pack })).resolves.toEqual({
      verified: false
    });
  });
});
