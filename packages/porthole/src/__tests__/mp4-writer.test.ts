import { describe, expect, it } from "vitest";
import { annexBToAvcc, createMp4, hasMp4Box, splitAnnexBNals } from "../mp4-writer.js";

const sps = Uint8Array.of(0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0xe5, 0x88);
const pps = Uint8Array.of(0, 0, 0, 1, 0x68, 0xce, 0x06, 0xe2);
const idr = Uint8Array.of(0, 0, 0, 1, 0x65, 0x88, 0x84, 0x21);

describe("MP4 writer", () => {
  it("splits Annex-B NAL units", () => {
    expect(splitAnnexBNals(concat([sps, pps])).map((nal) => nal[0] & 0x1f)).toEqual([
      7, 8,
    ]);
  });

  it("converts Annex-B samples to AVCC length-prefixed samples", () => {
    expect(Array.from(annexBToAvcc(idr).slice(0, 4))).toEqual([0, 0, 0, 4]);
  });

  it("writes ftyp, mdat, and moov boxes", () => {
    const mp4 = createMp4({
      width: 320,
      height: 180,
      config: concat([sps, pps]),
      samples: [
        { data: idr, timestamp: 0, keyframe: true },
        {
          data: Uint8Array.of(0, 0, 0, 1, 0x41, 0x9a),
          timestamp: 33_333,
          keyframe: false,
        },
      ],
    });

    expect(hasMp4Box(mp4, "ftyp")).toBe(true);
    expect(hasMp4Box(mp4, "mdat")).toBe(true);
    expect(hasMp4Box(mp4, "moov")).toBe(true);
  });
});

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
