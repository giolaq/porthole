import type { Engine } from "../engine/types.js";
import type { DeviceInfo } from "../device-manager.js";
import type { EngineInputEvent } from "../input.js";
import type { Actor } from "../protocol.js";
import { PortholeError } from "./errors.js";

export interface SessionHandle {
  getEngine(deviceId?: string): Engine | null;
  getDevice(deviceId?: string): DeviceInfo | undefined;
  serial(deviceId?: string): string;
  defaultDeviceId(): string;
  sendInput(event: EngineInputEvent, deviceId?: string): Promise<void>;
  isVega?(): boolean;
}

export interface ActionContext {
  session: SessionHandle;
  deviceId: string;
  actor: Actor;
}

export function actionDevice(ctx: ActionContext): DeviceInfo & { serial: string } {
  const device = ctx.session.getDevice(ctx.deviceId);
  if (!device?.serial) throw new PortholeError("NO_DEVICE", "No active device.", 503);
  return device as DeviceInfo & { serial: string };
}

export function actionEngine(ctx: ActionContext): Engine {
  const engine = ctx.session.getEngine(ctx.deviceId);
  if (!engine)
    throw new PortholeError("DEVICE_NOT_READY", "No active engine.", 503, true);
  return engine;
}
