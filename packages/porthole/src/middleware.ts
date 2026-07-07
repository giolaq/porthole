import type { IncomingMessage, ServerResponse } from "node:http";
import type { Engine } from "./engine/types.js";
import type { DeviceInfo } from "./device-manager.js";
import { createHttpServer } from "./server/http.js";
import { createWsServer } from "./server/ws.js";
import { clientDistPath } from "./paths.js";

export interface PortholeMiddlewareOptions {
  getEngine: () => Engine | null;
  getDevice?: () => DeviceInfo;
  mountPath?: string;
}

export type PortholeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

export function createPortholeMiddleware(
  opts: PortholeMiddlewareOptions,
): PortholeMiddleware {
  const mountPath = opts.mountPath ?? "/.porthole";
  const clientDir = clientDistPath();
  const { server } = createHttpServer({
    port: 0,
    host: "127.0.0.1",
    clientDir,
    getEngine: opts.getEngine,
    getDevice: opts.getDevice,
  });

  return (req, res, next) => {
    const url = req.url ?? "/";
    if (!url.startsWith(mountPath)) {
      next();
      return;
    }
    req.url = url.slice(mountPath.length) || "/";
    server.emit("request", req, res);
  };
}

export function attachPortholeWs(
  httpServer: Parameters<typeof createWsServer>[0]["httpServer"],
  opts: PortholeMiddlewareOptions,
): void {
  createWsServer({
    httpServer,
    getEngine: opts.getEngine,
    getDevice: opts.getDevice,
  });
}
