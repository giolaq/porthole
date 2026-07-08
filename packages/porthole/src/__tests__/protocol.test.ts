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

  it("round-trips device ids without breaking payloads", () => {
    const packet = encodeVideoPacket(
      {
        type: "frame",
        data: new Uint8Array([4, 5, 6]),
        timestamp: 84,
        keyframe: false,
      },
      "emulator-5556",
    );
    expect(decodeVideoPacket(packet.buffer)).toEqual({
      type: "delta",
      timestamp: 84,
      data: new Uint8Array([4, 5, 6]),
      deviceId: "emulator-5556",
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

  it("decodes swipe gestures", () => {
    expect(
      decodeInputEventJson(
        '{"kind":"gesture","type":"swipe","x1":0.1,"y1":0.2,"x2":0.3,"y2":0.4,"durationMs":250,"steps":4}',
      ),
    ).toEqual({
      kind: "gesture",
      type: "swipe",
      x1: 0.1,
      y1: 0.2,
      x2: 0.3,
      y2: 0.4,
      durationMs: 250,
      steps: 4,
    });
  });

  it("rejects swipe gestures without endpoints", () => {
    expect(() =>
      decodeInputEventJson('{"kind":"gesture","type":"swipe","x1":0.1,"y1":0.2}'),
    ).toThrow("Gesture end coordinates");
  });
});
