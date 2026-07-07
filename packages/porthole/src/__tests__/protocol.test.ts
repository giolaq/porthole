import { describe, expect, it } from "vitest";
import { decodeVideoPacket, encodeVideoPacket } from "../protocol.js";

describe("video packet protocol", () => {
  it("round-trips keyframe metadata", () => {
    const packet = encodeVideoPacket({
      type: "frame",
      data: new Uint8Array([1, 2, 3]),
      timestamp: 42,
      keyframe: true,
    });
    expect(decodeVideoPacket(packet.buffer)).toEqual({
      type: "key",
      timestamp: 42,
      data: new Uint8Array([1, 2, 3]),
    });
  });
});
