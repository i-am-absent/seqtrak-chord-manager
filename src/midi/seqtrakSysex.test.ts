import { describe, expect, it } from "vitest";
import {
  codeValueToNote,
  decodeParameterChange,
  decodeSoundName,
  encodeParameterChange,
  encodeParameterRequest,
  encodeTrackChordAddress,
  encodeTrackSoundNameAddress,
  noteToCodeValue,
  scaleAddress
} from "./seqtrakSysex";

describe("SEQTRAK SysEx helpers", () => {
  it("encodes request and change frames", () => {
    expect(encodeParameterRequest([0x30, 0x40, 0x7e])).toEqual([
      0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7
    ]);
    expect(encodeParameterChange([0x30, 0x67, 0x00], 0x3c)).toEqual([
      0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x67, 0x00, 0x3c, 0xf7
    ]);
  });

  it("rejects invalid encoded SysEx data bytes", () => {
    expect(() => encodeParameterRequest([0x30, 0x80, 0x7e])).toThrow(
      "address byte 1 must be an integer from 0 to 127."
    );
    expect(() => encodeParameterRequest([0x30, Number.NaN, 0x7e])).toThrow(
      "address byte 1 must be an integer from 0 to 127."
    );
    expect(() => encodeParameterChange([0x30, 0x67, 0x00], 0x80)).toThrow(
      "parameter value must be an integer from 0 to 127."
    );
  });

  it("decodes parameter change responses", () => {
    expect(
      decodeParameterChange([
        0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0x05, 0xf7
      ])
    ).toEqual({
      address: [0x30, 0x40, 0x7e],
      value: 0x05
    });
    expect(
      decodeParameterChange(
        Uint8Array.from([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x31, 0x07, 0x01, 0x50, 0xf7])
      )
    ).toEqual({
      address: [0x31, 0x07, 0x01],
      value: 0x50
    });
    expect(
      decodeParameterChange([0xf0, 0x43, 0x30, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7])
    ).toBeNull();
    expect(
      decodeParameterChange([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0x05, 0x00])
    ).toBeNull();
    expect(
      decodeParameterChange([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xf7])
    ).toBeNull();
    expect(
      decodeParameterChange([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x80, 0x7e, 0x05, 0xf7])
    ).toBeNull();
    expect(
      decodeParameterChange([0xf0, 0x43, 0x10, 0x7f, 0x1c, 0x0c, 0x30, 0x40, 0x7e, 0xff, 0xf7])
    ).toBeNull();
  });

  it("builds scale, sound, and chord addresses", () => {
    expect(scaleAddress()).toEqual([0x30, 0x40, 0x7e]);
    expect(encodeTrackSoundNameAddress(2, 0x0c)).toEqual([0x31, 0x02, 0x0c]);
    expect(encodeTrackChordAddress({ trackIndex: 7, scale: 0, slotIndex: 1, noteIndex: 0 })).toEqual([
      0x30, 0x67, 0x00
    ]);
    expect(encodeTrackChordAddress({ trackIndex: 7, scale: 3, slotIndex: 7, noteIndex: 3 })).toEqual([
      0x30, 0x67, 0x7b
    ]);
    expect(encodeTrackChordAddress({ trackIndex: 7, scale: 4, slotIndex: 1, noteIndex: 0 })).toEqual([
      0x30, 0x77, 0x00
    ]);
    expect(encodeTrackChordAddress({ trackIndex: 9, scale: 6, slotIndex: 2, noteIndex: 1 })).toEqual([
      0x30, 0x79, 0x45
    ]);
  });

  it("uses every confirmed SCALE-local chord offset group", () => {
    expect(
      Array.from({ length: 8 }, (_, scale) =>
        encodeTrackChordAddress({ trackIndex: 0, scale, slotIndex: 1, noteIndex: 0 })
      )
    ).toEqual([
      [0x30, 0x60, 0x00],
      [0x30, 0x60, 0x20],
      [0x30, 0x60, 0x40],
      [0x30, 0x60, 0x60],
      [0x30, 0x70, 0x00],
      [0x30, 0x70, 0x20],
      [0x30, 0x70, 0x40],
      [0x30, 0x70, 0x60]
    ]);
  });

  it("rejects invalid address inputs", () => {
    expect(() => encodeTrackSoundNameAddress(10 as never, 0)).toThrow(
      "trackIndex must be an integer from 0 to 9."
    );
    expect(() => encodeTrackSoundNameAddress(0, 0x64)).toThrow(
      "sound name byte index must be an integer from 0 to 99."
    );
    expect(() =>
      encodeTrackChordAddress({ trackIndex: 0, scale: 8, slotIndex: 1, noteIndex: 0 })
    ).toThrow("scale must be an integer from 0 to 7.");
    expect(() =>
      encodeTrackChordAddress({ trackIndex: 0, scale: 0, slotIndex: 0, noteIndex: 0 })
    ).toThrow("slotIndex must be an integer from 1 to 7.");
    expect(() =>
      encodeTrackChordAddress({ trackIndex: 0, scale: 0, slotIndex: 1, noteIndex: 4 })
    ).toThrow("noteIndex must be an integer from 0 to 3.");
  });

  it("converts code values and notes", () => {
    expect(codeValueToNote(0x00)).toBeNull();
    expect(codeValueToNote(0x24)).toBe(36);
    expect(codeValueToNote(0x60)).toBe(96);
    expect(() => codeValueToNote(0x23)).toThrow("Invalid SEQTRAK chord note value 35.");
    expect(() => codeValueToNote(0x61)).toThrow("Invalid SEQTRAK chord note value 97.");
    expect(noteToCodeValue(null)).toBe(0x00);
    expect(noteToCodeValue(60)).toBe(0x3c);
    expect(() => noteToCodeValue(20)).toThrow("Note 20 is outside the SEQTRAK chord range.");
    expect(() => noteToCodeValue(97)).toThrow("Note 97 is outside the SEQTRAK chord range.");
  });

  it("decodes sound names from ASCII values, ignoring byte zero null", () => {
    const bytes = [0x00, 0x50, 0x61, 0x64, 0x00, 0x58];
    expect(decodeSoundName(bytes)).toBe("Pad");
    expect(decodeSoundName([0x00, 0x44, 0x58])).toBe("DX");
    expect(decodeSoundName([0x00])).toBe("");
  });
});
