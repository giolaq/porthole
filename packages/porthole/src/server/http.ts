import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, normalize, relative } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { Engine } from "../engine/types.js";
import type { InputEvent } from "../input.js";
import type { DeviceInfo } from "../device-manager.js";
import { MjpegPoller } from "./mjpeg.js";
import { routeRequest } from "./router.js";
import { healthRoutes } from "./routes/health.js";
import { mediaRoutes } from "./routes/media.js";
import { inputRoutes } from "./routes/input.js";
import { uiRoutes } from "./routes/ui.js";
import { appsRoutes } from "./routes/apps.js";
import { logsRoutes } from "./routes/logs.js";

const routes = [
  ...healthRoutes,
  ...mediaRoutes,
  ...inputRoutes,
  ...uiRoutes,
  ...appsRoutes,
  ...logsRoutes,
];
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export interface HttpServerOptions {
  port: number;
  host: string;
  clientDir: string;
  getEngine: (deviceId?: string) => Engine | null;
  getDevice?: (deviceId?: string) => DeviceInfo | undefined;
  getDevices?: () => DeviceInfo[];
  handleInput?: (event: InputEvent, deviceId?: string) => Promise<void>;
  token?: string;
  forceMjpeg?: boolean;
  getStatus?: (deviceId?: string) => "waiting" | "ok" | "reconnecting" | "dead";
}

export function createHttpServer(opts: HttpServerOptions) {
  const { port, host, clientDir } = opts;
  const mjpegPollers = new Map<string, MjpegPoller>();
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
    const deviceId = parsedUrl.searchParams.get("device") ?? undefined;
    const handled = await routeRequest(
      { req, res, url: parsedUrl, deviceId, opts, mjpegPollers },
      routes,
    );
    if (!handled) await serveStatic(clientDir, parsedUrl.pathname, res);
  });
  return {
    server,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      }),
  };
}

async function serveStatic(
  clientDir: string,
  url: string,
  res: ServerResponse,
): Promise<void> {
  let filePath = join(clientDir, url === "/" ? "index.html" : url);
  const normalized = normalize(filePath);
  if (relative(clientDir, normalized).startsWith("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  filePath = normalized;

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = filePath.substring(filePath.lastIndexOf("."));
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}
