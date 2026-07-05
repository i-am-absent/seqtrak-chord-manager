import type { ChordPack, ChordSlot, SeqtrakTrackIndex } from "../domain/music";

export interface SeqtrakReadClient {
  readCurrentScale(): Promise<number>;
  readTrackSoundName(trackIndex: SeqtrakTrackIndex): Promise<string>;
  readChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    trackSoundName: string;
  }): Promise<ChordPack>;
}

export interface SeqtrakWriteClient {
  writeChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    pack: ChordPack;
  }): Promise<void>;
  readChordPack(input: {
    trackIndex: SeqtrakTrackIndex;
    scale: number;
    trackSoundName: string;
  }): Promise<ChordPack>;
}

export async function readPackFromSeqtrak(
  client: SeqtrakReadClient,
  trackIndex: SeqtrakTrackIndex
): Promise<{ scale: number; pack: ChordPack }> {
  const scale = await client.readCurrentScale();
  const trackSoundName = await client.readTrackSoundName(trackIndex);
  const pack = await client.readChordPack({ trackIndex, scale, trackSoundName });

  return { scale, pack };
}

export async function writePackToSeqtrak(
  client: SeqtrakWriteClient,
  input: { trackIndex: SeqtrakTrackIndex; scale: number; pack: ChordPack }
): Promise<{ verified: boolean }> {
  await client.writeChordPack(input);

  const readBack = await client.readChordPack({
    trackIndex: input.trackIndex,
    scale: input.scale,
    trackSoundName: input.pack.trackSoundName
  });

  return { verified: chordsMatch(input.pack.chords, readBack.chords) };
}

function chordsMatch(expected: ChordSlot[], actual: ChordSlot[]): boolean {
  if (expected.length !== actual.length) {
    return false;
  }

  return expected.every((expectedChord) => {
    const actualChord = actual.find((candidate) => candidate.slotIndex === expectedChord.slotIndex);

    return actualChord ? notesMatch(expectedChord.notes, actualChord.notes) : false;
  });
}

function notesMatch(expected: number[], actual: number[]): boolean {
  return expected.length === actual.length && expected.every((note, index) => actual[index] === note);
}
