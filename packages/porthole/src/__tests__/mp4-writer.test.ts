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

  it("clamps the stale cached-keyframe gap so duration stays sane", () => {
    // A late-joining recorder's first sample is the server's cached keyframe,
    // whose PTS can be minutes older than the live frames that follow. The
    // ~216s gap here must not become a 216-second frozen first frame.
    const mp4 = createMp4({
      width: 320,
      height: 180,
      config: concat([sps, pps]),
      samples: [
        { data: idr, timestamp: 225_994_004, keyframe: true },
        {
          data: Uint8Array.of(0, 0, 0, 1, 0x41, 0x9a),
          timestamp: 441_894_718,
          keyframe: false,
        },
        {
          data: Uint8Array.of(0, 0, 0, 1, 0x41, 0x9b),
          timestamp: 441_928_051,
          keyframe: false,
        },
      ],
    });

    const { duration, timescale } = readMvhd(mp4);
    const seconds = duration / timescale;
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(3);
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

function readMvhd(mp4: Uint8Array): { timescale: number; duration: number } {
  const type = new TextEncoder().encode("mvhd");
  for (let i = 0; i < mp4.byteLength - 24; i++) {
    if (type.every((byte, j) => mp4[i + j] === byte)) {
      const view = new DataView(mp4.buffer, mp4.byteOffset + i + 4);
      return { timescale: view.getUint32(12), duration: view.getUint32(16) };
    }
  }
  throw new Error("mvhd not found");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
