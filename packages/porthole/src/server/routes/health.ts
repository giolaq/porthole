import type { Route } from "../router.js";
import { listDevices } from "../../device-manager.js";
import { readState } from "../../state.js";
import { sendJson } from "../router.js";

export const healthRoutes: Route[] = [
  {
    method: "GET",
    path: "/health",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getEngine, getDevice, forceMjpeg, getStatus } = ctx.opts;
      const engine = getEngine(deviceId);
      if (engine?.metadata) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: getStatus?.(deviceId) ?? "ok",
            device: getDevice?.(deviceId),
            videoModes: ["webcodecs", "mjpeg"],
            preferredVideoMode: forceMjpeg ? "mjpeg" : "webcodecs",
            ...engine.metadata,
          }),
        );
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: getStatus?.(deviceId) ?? "waiting" }));
      }
      return;
    },
  },
  {
    method: "POST",
    path: "/health",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getEngine, getDevice, forceMjpeg, getStatus } = ctx.opts;
      const engine = getEngine(deviceId);
      if (engine?.metadata) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: getStatus?.(deviceId) ?? "ok",
            device: getDevice?.(deviceId),
            videoModes: ["webcodecs", "mjpeg"],
            preferredVideoMode: forceMjpeg ? "mjpeg" : "webcodecs",
            ...engine.metadata,
          }),
        );
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: getStatus?.(deviceId) ?? "waiting" }));
      }
      return;
    },
  },
  {
    method: "GET",
    path: "/api/devices",
    handler: async (ctx) => {
      const { res } = ctx;
      const { getDevices } = ctx.opts;
      await sendJson(res, 200, getDevices?.() ?? (await listDevices()));
      return;
    },
  },
  {
    method: "GET",
    path: "/api/state",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getEngine, getDevice, getDevices } = ctx.opts;
      await sendJson(res, 200, {
        device: getDevice?.(deviceId) ?? null,
        devices: getDevices?.() ?? [],
        engine: getEngine(deviceId)?.metadata ?? null,
        state: await readState(),
      });
      return;
    },
  },
];
