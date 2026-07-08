import { describe, expect, it } from "vitest";
import { encodeVideoPacket } from "../protocol.js";
import { H264Recorder } from "../recording.js";
import { hasMp4Box } from "../mp4-writer.js";

const config = Uint8Array.of(
  0,
  0,
  0,
  1,
  0x67,
  0x42,
  0x00,
  0x1f,
  0,
  0,
  0,
  1,
  0x68,
  0xce,
  0x06,
  0xe2,
);

describe("H264Recorder", () => {
  it("starts at the next keyframe and finalizes an MP4", () => {
    const recorder = new H264Recorder(320, 180);
    recorder.addPacket(encodeVideoPacket({ type: "config", data: config }));
    recorder.addPacket(
      encodeVideoPacket({
        type: "frame",
        data: Uint8Array.of(0, 0, 0, 1, 0x41, 0x01),
        timestamp: 0,
        keyframe: false,
      }),
    );
    recorder.addPacket(
      encodeVideoPacket({
        type: "frame",
        data: Uint8Array.of(0, 0, 0, 1, 0x65, 0x88),
        timestamp: 33_333,
        keyframe: true,
      }),
    );

    const mp4 = recorder.finalize();
    expect(recorder.sampleCount).toBe(1);
    expect(hasMp4Box(mp4, "ftyp")).toBe(true);
    expect(hasMp4Box(mp4, "moov")).toBe(true);
  });
});
