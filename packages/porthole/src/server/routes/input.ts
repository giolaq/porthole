import type { Route } from "../router.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { adbBin, findAndroidSdk } from "../../device-manager.js";
import { assertInputAllowed, parseInputEvent } from "../../input-validation.js";
import { sendGesture } from "../../gesture.js";
import {
  readJson,
  sendJson,
  rotationValue,
  withSerial,
  errorMessage,
} from "../router.js";
const execFileAsync = promisify(execFile);

export const inputRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/input",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getEngine, getDevice, handleInput } = ctx.opts;
      const device = getDevice?.(deviceId);
      if (!device) {
        await sendJson(res, 503, { ok: false, error: "No active device." });
        return;
      }
      try {
        const event = parseInputEvent(await readJson(req));
        assertInputAllowed(device.profile, event);
        const engine = getEngine(deviceId);
        if (!handleInput && !engine) {
          throw new Error("No active engine.");
        }
        if (handleInput) {
          await handleInput(event, deviceId);
        } else if (event.kind === "gesture") {
          if (!engine) throw new Error("No active engine.");
          await sendGesture(event, (touch) => engine.sendInput(touch));
        } else {
          await engine?.sendInput(event);
        }
        await sendJson(res, 200, { ok: true });
      } catch (error) {
        await sendJson(res, 400, { ok: false, error: errorMessage(error) });
      }
      return;
    },
  },
  {
    method: "POST",
    path: "/api/rotate",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial, device) => {
          if (device.profile === "tv") {
            throw new Error("Rotation controls are only available for phone profiles.");
          }
          const body = (await readJson(req)) as Record<string, unknown>;
          const orientation = String(body.orientation ?? "");
          const rotation = rotationValue(orientation);
          const adb = adbBin(findAndroidSdk());
          await execFileAsync(adb, [
            "-s",
            serial,
            "shell",
            "settings",
            "put",
            "system",
            "accelerometer_rotation",
            "0",
          ]);
          await execFileAsync(adb, [
            "-s",
            serial,
            "shell",
            "settings",
            "put",
            "system",
            "user_rotation",
            String(rotation),
          ]);
          await sendJson(res, 200, { ok: true, rotation });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/emu",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          if (
            !Array.isArray(body.args) ||
            !body.args.every((arg) => typeof arg === "string")
          ) {
            throw new Error("args must be an array of strings.");
          }
          const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), [
            "-s",
            serial,
            "emu",
            ...body.args,
          ]);
          await sendJson(res, 200, { ok: true, stdout });
        },
      );
      return;
    },
  },
];
