import type { ChordPack } from "../domain/music";
import type { PublicPack } from "./types";

export function sharedPackToChordPack(pack: PublicPack): ChordPack {
  const localPack: ChordPack = {
    packName: pack.packName,
    authorName: pack.authorName,
    tags: [...pack.tags],
    key: pack.key,
    trackSoundName: pack.trackSoundName,
    chords: pack.chords.map((chord) => ({
      slotIndex: chord.slotIndex,
      notes: [...chord.notes],
      displayName: chord.displayName
    })),
    reportedCount: 0,
    hidden: false,
    deleted: false
  };
  if (pack.sourceTrackIndex !== undefined) {
    localPack.sourceTrackIndex = pack.sourceTrackIndex;
  }
  return localPack;
}
