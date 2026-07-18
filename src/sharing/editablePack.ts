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

function textErrors(label: string, value: unknown, max: number): string[] {
  if (typeof value !== "string") return [`${label} must be a string.`];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEditablePack(pack: EditablePack): string[] {
  const candidate: unknown = pack;
  if (!isRecord(candidate)) return ["Pack must be an object."];

  const errors = [
    ...textErrors("Pack name", candidate.packName, 100),
    ...textErrors("Author", candidate.authorName, 50),
    ...textErrors("Track sound", candidate.trackSoundName, 100)
  ];
  let structurallySafe = typeof candidate.packName === "string"
    && typeof candidate.authorName === "string"
    && typeof candidate.trackSoundName === "string";

  if (!Array.isArray(candidate.tags)) {
    errors.push("Tags must be an array.");
    structurallySafe = false;
  } else {
    for (const tag of candidate.tags) {
      if (typeof tag !== "string") {
        errors.push("Tags must be strings.");
        structurallySafe = false;
      } else {
        errors.push(...textErrors("Tags", tag, 30));
      }
    }
  }

  if (!Array.isArray(candidate.chords)) {
    errors.push("Chords must be an array.");
    structurallySafe = false;
  } else {
    for (const chord of candidate.chords) {
      if (!isRecord(chord)) {
        errors.push("Chord must be an object.");
        structurallySafe = false;
        continue;
      }
      if (typeof chord.slotIndex !== "number") {
        errors.push("Chord slot index must be a number.");
        structurallySafe = false;
      }
      if (!Array.isArray(chord.notes)) {
        errors.push("Chord notes must be an array.");
        structurallySafe = false;
      } else if (chord.notes.some((note) => typeof note !== "number")) {
        errors.push("Chord notes must be numbers.");
        structurallySafe = false;
      }
      const chordNameErrors = textErrors("Chord name", chord.displayName, 100);
      if (typeof chord.displayName !== "string") structurallySafe = false;
      errors.push(...chordNameErrors);
    }
  }

  if (Array.isArray(candidate.tags)) {
    if (candidate.tags.length > 10) errors.push("A shared pack can contain up to 10 tags.");
    if (new Set(candidate.tags).size !== candidate.tags.length) errors.push("Tags must be unique.");
  }
  if (typeof candidate.key !== "string") {
    errors.push("Key must be a string.");
    structurallySafe = false;
  } else if (!chromaticKeys.includes(candidate.key as EditablePack["key"])) {
    errors.push("Key must be a chromatic note name.");
  }
  const sourceTrackIndex = candidate.sourceTrackIndex;
  if (sourceTrackIndex !== undefined) {
    if (typeof sourceTrackIndex !== "number") {
      errors.push("Source track must be an integer from 0 to 9.");
      structurallySafe = false;
    } else if (!Number.isInteger(sourceTrackIndex) || sourceTrackIndex < 0 || sourceTrackIndex > 9) {
      errors.push("Source track must be an integer from 0 to 9.");
    }
  }
  if (structurallySafe) {
    errors.push(...validatePack({
      ...snapshot(pack), reportedCount: 0, hidden: false, deleted: false
    }));
  }
  return [...new Set(errors)];
}

export function editablePackFingerprint(pack: EditablePack): string {
  return JSON.stringify(snapshot(pack));
}
