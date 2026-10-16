import type { Route } from "../router.js";
import { MjpegPoller } from "../mjpeg.js";

export const mediaRoutes: Route[] = [
  {
    method: "GET",
    path: "/stream.mjpeg",
    handler: async (ctx) => {
      const { res, deviceId, mjpegPollers } = ctx;
      const { getEngine, getDevice } = ctx.opts;
      const engine = getEngine(deviceId);
      if (!engine) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("No engine");
        return;
      }
      const pollerKey = deviceId ?? getDevice?.()?.serial ?? "default";
      let poller = mjpegPollers.get(pollerKey);
      if (!poller) {
        poller = new MjpegPoller(() => getEngine(deviceId));
        mjpegPollers.set(pollerKey, poller);
      }
      poller.addClient(res);
      return;
    },
  },
  {
    method: "GET",
    path: "/screenshot",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getEngine } = ctx.opts;
      const engine = getEngine(deviceId);
      if (!engine) {
        res.writeHead(503);
        res.end("No engine");
        return;
      }
      try {
        const png = await engine.screenshot();
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": png.byteLength.toString(),
        });
        res.end(png);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
      return;
    },
  },
  {
    method: "POST",
    path: "/screenshot",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getEngine } = ctx.opts;
      const engine = getEngine(deviceId);
      if (!engine) {
        res.writeHead(503);
        res.end("No engine");
        return;
      }
      try {
        const png = await engine.screenshot();
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": png.byteLength.toString(),
        });
        res.end(png);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
      return;
    },
  },
];
