import type { InputEvent } from "./input.js";
import type { RemoteButton } from "./keycodes.js";
import { REMOTE_BUTTON_TO_KEYCODE } from "./keycodes.js";
import type { DeviceProfile } from "./profiles.js";

const TOUCH_PHASES = new Set(["down", "move", "up"]);
const KEY_PHASES = new Set(["down", "up"]);

export function parseInputEvent(value: unknown): InputEvent {
  if (!value || typeof value !== "object") {
    throw new Error("Input event must be an object.");
  }
  const event = value as Record<string, unknown>;

  if (event.kind === "touch") {
    if (!TOUCH_PHASES.has(String(event.phase))) {
      throw new Error("Touch phase must be down, move, or up.");
    }
    if (!isNormalized(event.x) || !isNormalized(event.y)) {
      throw new Error("Touch coordinates must be numbers in 0..1.");
    }
    return {
      kind: "touch",
      phase: event.phase as "down" | "move" | "up",
      x: event.x,
      y: event.y,
    };
  }

  if (event.kind === "key") {
    if (!KEY_PHASES.has(String(event.phase))) {
      throw new Error("Key phase must be down or up.");
    }
    if (!Number.isInteger(event.keycode)) {
      throw new Error("Keycode must be an integer.");
    }
    const keycode = event.keycode as number;
    return {
      kind: "key",
      phase: event.phase as "down" | "up",
      keycode,
    };
  }

  if (event.kind === "text") {
    if (typeof event.text !== "string") {
      throw new Error("Text input must include a string text field.");
    }
    return { kind: "text", text: event.text };
  }

  if (event.kind === "remote") {
    if (typeof event.button !== "string" || !isRemoteButton(event.button)) {
      throw new Error(
        `Remote button must be one of ${Object.keys(REMOTE_BUTTON_TO_KEYCODE).join(", ")}.`,
      );
    }
    return { kind: "remote", button: event.button };
  }

  throw new Error("Unknown input event kind.");
}

export function assertInputAllowed(profile: DeviceProfile, event: InputEvent): void {
  if (profile === "tv" && event.kind === "touch") {
    throw new Error("Touch input is not available for TV profile sessions.");
  }
}

function isNormalized(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isRemoteButton(value: string): value is RemoteButton {
  return Object.prototype.hasOwnProperty.call(REMOTE_BUTTON_TO_KEYCODE, value);
}
