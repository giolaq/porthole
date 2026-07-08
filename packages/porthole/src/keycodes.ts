import type { RemoteButton } from "./protocol.js";

export const AndroidKeycode = {
  KEYCODE_DPAD_UP: 19,
  KEYCODE_DPAD_DOWN: 20,
  KEYCODE_DPAD_LEFT: 21,
  KEYCODE_DPAD_RIGHT: 22,
  KEYCODE_DPAD_CENTER: 23,
  KEYCODE_BACK: 4,
  KEYCODE_HOME: 3,
  KEYCODE_MENU: 82,
  KEYCODE_MEDIA_PLAY_PAUSE: 85,
  KEYCODE_MEDIA_REWIND: 89,
  KEYCODE_MEDIA_FAST_FORWARD: 90,
  KEYCODE_VOLUME_UP: 24,
  KEYCODE_VOLUME_DOWN: 25,
  KEYCODE_WAKEUP: 224,
} as const;

export const REMOTE_BUTTON_TO_KEYCODE: Record<RemoteButton, number> = {
  dpad_up: AndroidKeycode.KEYCODE_DPAD_UP,
  dpad_down: AndroidKeycode.KEYCODE_DPAD_DOWN,
  dpad_left: AndroidKeycode.KEYCODE_DPAD_LEFT,
  dpad_right: AndroidKeycode.KEYCODE_DPAD_RIGHT,
  select: AndroidKeycode.KEYCODE_DPAD_CENTER,
  back: AndroidKeycode.KEYCODE_BACK,
  home: AndroidKeycode.KEYCODE_HOME,
  menu: AndroidKeycode.KEYCODE_MENU,
  play_pause: AndroidKeycode.KEYCODE_MEDIA_PLAY_PAUSE,
  rewind: AndroidKeycode.KEYCODE_MEDIA_REWIND,
  fast_forward: AndroidKeycode.KEYCODE_MEDIA_FAST_FORWARD,
  volume_up: AndroidKeycode.KEYCODE_VOLUME_UP,
  volume_down: AndroidKeycode.KEYCODE_VOLUME_DOWN,
};

export type { RemoteButton };
