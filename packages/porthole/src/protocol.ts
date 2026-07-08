export const REMOTE_BUTTONS = [
  "dpad_up",
  "dpad_down",
  "dpad_left",
  "dpad_right",
  "select",
  "back",
  "home",
  "menu",
  "play_pause",
  "rewind",
  "fast_forward",
  "volume_up",
  "volume_down",
] as const;

export type RemoteButton = (typeof REMOTE_BUTTONS)[number];

export interface TouchEvent {
  kind: "touch";
  phase: "down" | "move" | "up";
  x: number;
  y: number;
}

export interface KeyEvent {
  kind: "key";
  phase: "down" | "up";
  keycode: number;
}

export interface TextEvent {
  kind: "text";
  text: string;
}

export interface RemoteEvent {
  kind: "remote";
  button: RemoteButton;
}

export interface SwipeGestureEvent {
  kind: "gesture";
  type: "swipe";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  durationMs?: number;
  steps?: number;
}

export interface LongPressGestureEvent {
  kind: "gesture";
  type: "longpress";
  x1: number;
  y1: number;
  durationMs?: number;
  steps?: number;
}

export type GestureEvent = SwipeGestureEvent | LongPressGestureEvent;
export type EngineInputEvent = TouchEvent | KeyEvent | TextEvent | RemoteEvent;
export type InputEvent = EngineInputEvent | GestureEvent;

export interface VideoChunk {
  type: "config" | "frame";
  data: Uint8Array;
  timestamp?: number;
  keyframe?: boolean;
}

export type DeviceProfile = "phone" | "tv";
export type DeviceState = "running" | "stopped" | "offline";
export type VideoMode = "webcodecs" | "mjpeg";

export interface ProtocolDevice {
  name: string;
  serial: string | null;
  profile: DeviceProfile;
  state: DeviceState;
}

export interface HealthResponse {
  status: "waiting" | "ok" | "reconnecting" | "dead";
  codec?: string;
  width?: number;
  height?: number;
  device?: ProtocolDevice;
  preferredVideoMode?: VideoMode;
  videoModes?: VideoMode[];
}

export interface InputResponse {
  ok: boolean;
}

export type WsPacketType = "config" | "delta" | "key";

export interface DecodedWsPacket {
  type: WsPacketType;
  timestamp: number;
  data: Uint8Array;
  deviceId?: string;
}

const PACKET_HEADER_BYTES = 13;
const LEGACY_PACKET_HEADER_BYTES = 5;
const DEVICE_PACKET_FLAG = 0x80;
const TOUCH_PHASES = new Set(["down", "move", "up"]);
const KEY_PHASES = new Set(["down", "up"]);
const REMOTE_BUTTON_SET = new Set<string>(REMOTE_BUTTONS);

export function encodeVideoPacket(chunk: VideoChunk, deviceId?: string): Uint8Array {
  const type = chunk.type === "config" ? 0 : chunk.keyframe ? 2 : 1;
  const deviceBytes =
    deviceId === undefined ? undefined : new TextEncoder().encode(deviceId);
  const headerLength =
    deviceBytes === undefined
      ? PACKET_HEADER_BYTES
      : PACKET_HEADER_BYTES + 2 + deviceBytes.length;
  const header = new Uint8Array(headerLength);
  const view = new DataView(header.buffer);
  view.setUint8(0, deviceBytes === undefined ? type : type | DEVICE_PACKET_FLAG);
  view.setUint32(1, chunk.data.byteLength);
  view.setFloat64(5, chunk.timestamp ?? 0);
  if (deviceBytes !== undefined) {
    view.setUint16(PACKET_HEADER_BYTES, deviceBytes.length);
    header.set(deviceBytes, PACKET_HEADER_BYTES + 2);
  }
  const packet = new Uint8Array(headerLength + chunk.data.byteLength);
  packet.set(header, 0);
  packet.set(chunk.data, headerLength);
  return packet;
}

export function decodeVideoPacket(data: ArrayBufferLike): DecodedWsPacket {
  const view = new DataView(data);
  const rawType = view.getUint8(0);
  const hasDeviceId = (rawType & DEVICE_PACKET_FLAG) !== 0;
  const length = view.getUint32(1);
  const timestamp = data.byteLength >= PACKET_HEADER_BYTES ? view.getFloat64(5) : 0;
  const legacyOffset =
    data.byteLength >= PACKET_HEADER_BYTES
      ? PACKET_HEADER_BYTES
      : LEGACY_PACKET_HEADER_BYTES;
  let offset = legacyOffset;
  let deviceId: string | undefined;
  if (hasDeviceId) {
    const deviceLength = view.getUint16(PACKET_HEADER_BYTES);
    offset = PACKET_HEADER_BYTES + 2 + deviceLength;
    deviceId = new TextDecoder().decode(
      new Uint8Array(data, PACKET_HEADER_BYTES + 2, deviceLength),
    );
  }
  const typeByte = rawType & ~DEVICE_PACKET_FLAG;
  const type: WsPacketType = typeByte === 0 ? "config" : typeByte === 2 ? "key" : "delta";
  return {
    type,
    timestamp,
    data: new Uint8Array(data, offset, length),
    ...(deviceId === undefined ? {} : { deviceId }),
  };
}

export function encodeInputEvent(event: InputEvent): string {
  return JSON.stringify(event);
}

export function decodeInputEvent(value: unknown): InputEvent {
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
      phase: event.phase as TouchEvent["phase"],
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
    return {
      kind: "key",
      phase: event.phase as KeyEvent["phase"],
      keycode: event.keycode as number,
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
      throw new Error(`Remote button must be one of ${REMOTE_BUTTONS.join(", ")}.`);
    }
    return { kind: "remote", button: event.button };
  }

  if (event.kind === "gesture") {
    if (event.type !== "swipe" && event.type !== "longpress") {
      throw new Error("Gesture type must be swipe or longpress.");
    }
    if (!isNormalized(event.x1) || !isNormalized(event.y1)) {
      throw new Error("Gesture start coordinates must be numbers in 0..1.");
    }
    const durationMs = optionalPositiveNumber(event.durationMs, "Gesture duration");
    const steps = optionalPositiveInteger(event.steps, "Gesture steps");
    if (event.type === "longpress") {
      return {
        kind: "gesture",
        type: "longpress",
        x1: event.x1,
        y1: event.y1,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(steps === undefined ? {} : { steps }),
      };
    }
    if (!isNormalized(event.x2) || !isNormalized(event.y2)) {
      throw new Error("Gesture end coordinates must be numbers in 0..1.");
    }
    return {
      kind: "gesture",
      type: "swipe",
      x1: event.x1,
      y1: event.y1,
      x2: event.x2,
      y2: event.y2,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(steps === undefined ? {} : { steps }),
    };
  }

  throw new Error("Unknown input event kind.");
}

export function decodeInputEventJson(json: string): InputEvent {
  return decodeInputEvent(JSON.parse(json));
}

function isNormalized(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isRemoteButton(value: string): value is RemoteButton {
  return REMOTE_BUTTON_SET.has(value);
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}
