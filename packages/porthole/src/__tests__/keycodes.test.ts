import { describe, it, expect } from "vitest";
import { REMOTE_BUTTON_TO_KEYCODE, AndroidKeycode } from "../keycodes.js";

describe("REMOTE_BUTTON_TO_KEYCODE", () => {
  it("maps dpad_up to KEYCODE_DPAD_UP", () => {
    expect(REMOTE_BUTTON_TO_KEYCODE.dpad_up).toBe(AndroidKeycode.KEYCODE_DPAD_UP);
  });

  it("maps select to KEYCODE_DPAD_CENTER", () => {
    expect(REMOTE_BUTTON_TO_KEYCODE.select).toBe(AndroidKeycode.KEYCODE_DPAD_CENTER);
  });

  it("maps back to KEYCODE_BACK", () => {
    expect(REMOTE_BUTTON_TO_KEYCODE.back).toBe(AndroidKeycode.KEYCODE_BACK);
  });

  it("maps play_pause to KEYCODE_MEDIA_PLAY_PAUSE", () => {
    expect(REMOTE_BUTTON_TO_KEYCODE.play_pause).toBe(
      AndroidKeycode.KEYCODE_MEDIA_PLAY_PAUSE,
    );
  });

  it("maps volume_up to KEYCODE_VOLUME_UP", () => {
    expect(REMOTE_BUTTON_TO_KEYCODE.volume_up).toBe(AndroidKeycode.KEYCODE_VOLUME_UP);
  });

  it("has all 13 remote buttons mapped", () => {
    expect(Object.keys(REMOTE_BUTTON_TO_KEYCODE)).toHaveLength(13);
  });
});
