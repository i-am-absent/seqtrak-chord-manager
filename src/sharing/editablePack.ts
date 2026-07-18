import { chromaticKeys, validatePack, type ChordPack } from "../domain/music";
import type { EditablePack } from "./types";

function snapshot(pack: EditablePack | ChordPack): EditablePack {
  const result: EditablePack = {
    packName: pack.packName,
    authorName: pack.authorName,
    tags: [...pack.tags],
    key: pack.key,
    trackSoundName: pack.trackSoundName,
    chords: pack.chords.map((chord) => ({
      slotIndex: chord.slotIndex,
      notes: [...chord.notes],
      displayName: chord.displayName
    }))
  };
  if (pack.sourceTrackIndex !== undefined) result.sourceTrackIndex = pack.sourceTrackIndex;
  return result;
}

export function toEditablePack(pack: ChordPack): EditablePack {
  return snapshot(pack);
}

function textErrors(label: string, value: string, max: number): string[] {
  if ([...value].length === 0) return [`${label} is required.`];
  const errors: string[] = [];
  if (value.startsWith(" ") || value.endsWith(" ")) {
    errors.push(`${label} must not start or end with a space.`);
  }
  if ([...value].length > max) {
    errors.push(`${label} must contain no more than ${max} code points.`);
  }
  return errors;
}

export function validateEditablePack(pack: EditablePack): string[] {
  const errors = [
    ...textErrors("Pack name", pack.packName, 100),
    ...textErrors("Author", pack.authorName, 50),
    ...textErrors("Track sound", pack.trackSoundName, 100)
  ];
  for (const tag of pack.tags) errors.push(...textErrors("Tags", tag, 30));
  for (const chord of pack.chords) errors.push(...textErrors("Chord name", chord.displayName, 100));
  if (pack.tags.length > 10) errors.push("A shared pack can contain up to 10 tags.");
  if (new Set(pack.tags).size !== pack.tags.length) errors.push("Tags must be unique.");
  if (!chromaticKeys.includes(pack.key)) errors.push("Key must be a chromatic note name.");
  if (pack.sourceTrackIndex !== undefined && (
    !Number.isInteger(pack.sourceTrackIndex) || pack.sourceTrackIndex < 0 || pack.sourceTrackIndex > 9
  )) errors.push("Source track must be an integer from 0 to 9.");
  errors.push(...validatePack({
    ...snapshot(pack), reportedCount: 0, hidden: false, deleted: false
  }));
  return errors;
}

export function editablePackFingerprint(pack: EditablePack): string {
  return JSON.stringify(snapshot(pack));
}
