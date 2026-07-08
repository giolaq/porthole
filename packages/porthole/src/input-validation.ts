import type { InputEvent } from "./input.js";
import type { DeviceProfile } from "./profiles.js";
import { decodeInputEvent } from "./protocol.js";

export function parseInputEvent(value: unknown): InputEvent {
  return decodeInputEvent(value);
}

export function assertInputAllowed(profile: DeviceProfile, event: InputEvent): void {
  if (profile === "tv" && event.kind === "touch") {
    throw new Error("Touch input is not available for TV profile sessions.");
  }
}
