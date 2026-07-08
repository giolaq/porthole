import { describe, expect, it } from "vitest";
import {
  decodeInputEventJson,
  decodeVideoPacket,
  encodeInputEvent,
  encodeVideoPacket,
  type InputEvent,
} from "../protocol.js";

const inputFixture: InputEvent = { kind: "touch", phase: "move", x: 0.25, y: 0.75 };

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

describe("input protocol", () => {
  it("round-trips shared input fixtures", () => {
    expect(decodeInputEventJson(encodeInputEvent(inputFixture))).toEqual(inputFixture);
  });

  it("rejects invalid input event payloads", () => {
    expect(() =>
      decodeInputEventJson('{"kind":"touch","phase":"down","x":2,"y":0}'),
    ).toThrow("Touch coordinates");
  });
});
