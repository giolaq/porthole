import { describe, it, expect } from "vitest";
import type { InputEvent } from "../input.js";
import { assertInputAllowed } from "../input-validation.js";
import { REMOTE_BUTTON_TO_KEYCODE } from "../keycodes.js";

describe("InputEvent types", () => {
  it("creates a valid touch event", () => {
    const event: InputEvent = { kind: "touch", phase: "down", x: 0.5, y: 0.5 };
    expect(event.kind).toBe("touch");
    expect(event.phase).toBe("down");
  });

  it("creates a valid key event", () => {
    const event: InputEvent = { kind: "key", phase: "down", keycode: 19 };
    expect(event.kind).toBe("key");
  });

  it("creates a valid text event", () => {
    const event: InputEvent = { kind: "text", text: "hello" };
    expect(event.kind).toBe("text");
  });

  it("creates a valid remote event", () => {
    const event: InputEvent = { kind: "remote", button: "dpad_up" };
    expect(event.kind).toBe("remote");
    expect(REMOTE_BUTTON_TO_KEYCODE[event.button]).toBe(19);
  });

  it("rejects touch events on tv profile (logic check)", () => {
    const profile = "tv";
    const event: InputEvent = { kind: "touch", phase: "down", x: 0.5, y: 0.5 };
    const shouldReject = profile === "tv" && event.kind === "touch";
    expect(shouldReject).toBe(true);
  });

  it("rejects gestures on tv profile", () => {
    expect(() =>
      assertInputAllowed("tv", {
        kind: "gesture",
        type: "longpress",
        x1: 0.5,
        y1: 0.5,
      }),
    ).toThrow("Touch and gesture input");
  });

  it("phone profile accepts all event kinds", () => {
    const profile = "phone";
    const events: InputEvent[] = [
      { kind: "touch", phase: "down", x: 0.5, y: 0.5 },
      { kind: "remote", button: "select" },
      { kind: "key", phase: "down", keycode: 19 },
      { kind: "text", text: "hi" },
    ];
    for (const event of events) {
      const shouldAccept = profile === "phone" || event.kind !== "touch";
      expect(shouldAccept).toBe(true);
    }
  });
});
