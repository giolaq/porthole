export const VERSION = "0.0.1";

export {
  listDevices,
  findAndroidSdk,
  bootDevice,
  shutdownDevice,
} from "./device-manager.js";
export { detectProfileFromConfig, detectProfile } from "./profiles.js";
export { ScrcpyEngine } from "./engine/scrcpy-engine.js";
export { Session } from "./session.js";
export { startMcpServer } from "./mcp/server.js";
export type { DeviceInfo } from "./device-manager.js";
export type { DeviceProfile } from "./profiles.js";
export type {
  InputEvent,
  TouchEvent,
  KeyEvent,
  TextEvent,
  RemoteEvent,
} from "./input.js";
export type { Engine, EngineMetadata, VideoChunk } from "./engine/types.js";
export { AndroidKeycode, REMOTE_BUTTON_TO_KEYCODE } from "./keycodes.js";
export type { RemoteButton } from "./keycodes.js";
