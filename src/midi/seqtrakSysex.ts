import {
  SEQTRAK_MAX_CHORD_NOTE,
  SEQTRAK_MIN_CHORD_NOTE,
  type SeqtrakTrackIndex
} from "../domain/music";

export type SysexAddress = readonly [number, number, number];

const REQUEST_HEADER = [0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c] as const;
const CHANGE_HEADER = [0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c] as const;

export function encodeParameterRequest(address: SysexAddress): number[] {
  assertSysexAddress(address);

  return [...REQUEST_HEADER, ...address, 0xf7];
}

export function encodeParameterChange(address: SysexAddress, value: number): number[] {
  assertSysexAddress(address);
  assertMidiDataByte(value, "parameter value");

  return [...CHANGE_HEADER, ...address, value, 0xf7];
}

export function decodeParameterChange(data: ArrayLike<number>): { address: SysexAddress; value: number } | null {
  const bytes = Array.from(data);

  if (bytes.length !== 11) {
    return null;
  }

  if (!CHANGE_HEADER.every((byte, index) => bytes[index] === byte)) {
    return null;
  }

  if (bytes[10] !== 0xf7) {
    return null;
  }

  if (![bytes[6], bytes[7], bytes[8], bytes[9]].every(isMidiDataByte)) {
    return null;
  }

  return { address: [bytes[6], bytes[7], bytes[8]], value: bytes[9] };
}

export function scaleAddress(): SysexAddress {
  return [0x30, 0x40, 0x7e];
}

export function keyAddress(): SysexAddress {
  return [0x30, 0x40, 0x7f];
}

export function encodeTrackSoundNameAddress(
  trackIndex: SeqtrakTrackIndex,
  byteIndex: number
): SysexAddress {
  assertRange(trackIndex, 0, 9, "trackIndex");
  assertRange(byteIndex, 0, 0x63, "sound name byte index");

  return [0x31, trackIndex, byteIndex];
}

export function encodeTrackChordAddress(input: {
  trackIndex: SeqtrakTrackIndex;
  scale: number;
  slotIndex: number;
  noteIndex: number;
}): SysexAddress {
  assertRange(input.trackIndex, 0, 9, "trackIndex");
  assertRange(input.scale, 0, 7, "scale");
  assertRange(input.slotIndex, 1, 7, "slotIndex");
  assertRange(input.noteIndex, 0, 3, "noteIndex");

  const scaleBank = input.scale < 4 ? 0x60 : 0x70;
  const scaleGroupOffset = (input.scale % 4) * 0x20;
  const padOffset = (input.slotIndex - 1) * 4;
  const noteOffset = input.noteIndex;

  return [0x30, scaleBank + input.trackIndex, scaleGroupOffset + padOffset + noteOffset];
}

export function codeValueToNote(value: number): number | null {
  if (value === 0x00) {
    return null;
  }

  if (!Number.isInteger(value) || value < SEQTRAK_MIN_CHORD_NOTE || value > SEQTRAK_MAX_CHORD_NOTE) {
    throw new Error(`Invalid SEQTRAK chord note value ${value}.`);
  }

  return value;
}

export function noteToCodeValue(note: number | null): number {
  if (note === null) {
    return 0x00;
  }

  if (!Number.isInteger(note) || note < SEQTRAK_MIN_CHORD_NOTE || note > SEQTRAK_MAX_CHORD_NOTE) {
    throw new Error(`Note ${note} is outside the SEQTRAK chord range.`);
  }

  return note;
}

export function decodeSoundName(values: number[]): string {
  const chars = values.slice(1);
  const terminatorIndex = chars.indexOf(0x00);
  const visible = terminatorIndex >= 0 ? chars.slice(0, terminatorIndex) : chars;

  return String.fromCharCode(...visible);
}

function assertRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
}

function assertSysexAddress(address: SysexAddress): void {
  address.forEach((byte, index) => assertMidiDataByte(byte, `address byte ${index}`));
}

function assertMidiDataByte(value: number, label: string): void {
  if (!isMidiDataByte(value)) {
    throw new Error(`${label} must be an integer from 0 to 127.`);
  }
}

function isMidiDataByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0x00 && value <= 0x7f;
}
