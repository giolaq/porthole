import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { Engine } from "../engine/types.js";

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
  getEngine: () => Engine | null;
}

export function createHttpServer(opts: HttpServerOptions) {
  const { port, host, clientDir, getEngine } = opts;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    if (url === "/health") {
      const engine = getEngine();
      if (engine?.metadata) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", ...engine.metadata }));
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "waiting" }));
      }
      return;
    }

    if (url === "/screenshot") {
      const engine = getEngine();
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
    }

    await serveStatic(clientDir, url, res);
  });

  return {
    server,
    listen: () =>
      new Promise<void>((resolve) => {
        server.listen(port, host, () => resolve());
      }),
  };
}

async function serveStatic(
  clientDir: string,
  url: string,
  res: ServerResponse,
): Promise<void> {
  let filePath = join(clientDir, url === "/" ? "index.html" : url);

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
