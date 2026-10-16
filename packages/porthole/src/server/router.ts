import type { IncomingMessage, ServerResponse } from "node:http";
import { basename } from "node:path";
import type { DeviceInfo } from "../device-manager.js";
import type { HttpServerOptions } from "./http.js";
import type { MjpegPoller } from "./mjpeg.js";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  deviceId?: string;
  opts: HttpServerOptions;
  mjpegPollers: Map<string, MjpegPoller>;
}
export interface Route {
  method: "GET" | "POST";
  path: string;
  handler(ctx: RouteContext): Promise<void>;
}
export async function routeRequest(ctx: RouteContext, routes: Route[]): Promise<boolean> {
  const { req, res, url, opts } = ctx;
  if (!isAuthorized(req, url, opts.token)) {
    await sendJson(res, 401, { ok: false, error: "Porthole token required." });
    return true;
  }
  const tokenFromQuery = url.searchParams.get("token");
  if (opts.token && tokenFromQuery === opts.token) {
    res.setHeader("Set-Cookie", `porthole_token=${opts.token}; Path=/; SameSite=Lax`);
  }
  const route = routes.find((item) => {
    if (item.path !== url.pathname) return false;
    if (item.method === req.method) return true;
    // These two endpoints historically ignored the request method.
    return (
      (url.pathname === "/health" || url.pathname === "/screenshot") &&
      item.method === "GET"
    );
  });
  if (!route) return false;
  await route.handler(ctx);
  return true;
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readText(req);
  return JSON.parse(raw);
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): Promise<void> {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function withSerial(
  res: ServerResponse,
  getDevice: (() => DeviceInfo | undefined) | undefined,
  handler: (serial: string, device: DeviceInfo) => Promise<void>,
): Promise<void> {
  const device = getDevice?.();
  if (!device?.serial) {
    await sendJson(res, 503, { ok: false, error: "No active device." });
    return;
  }
  try {
    await handler(device.serial, device);
  } catch (error) {
    await sendJson(res, 400, { ok: false, error: errorMessage(error) });
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sanitizeFilename(value: string | string[]): string {
  return basename(Array.isArray(value) ? (value[0] ?? "porthole-drop") : value);
}

export function rotationValue(orientation: string): number {
  switch (orientation) {
    case "portrait":
      return 0;
    case "landscape":
    case "right":
      return 1;
    case "left":
      return 3;
    default:
      throw new Error("orientation must be portrait, landscape, left, or right.");
  }
}

function isAuthorized(
  req: IncomingMessage,
  url: URL,
  token: string | undefined,
): boolean {
  if (!token) return true;
  if (isLocalAddress(req.socket.remoteAddress)) return true;
  if (url.searchParams.get("token") === token) return true;
  return parseCookie(req.headers.cookie ?? "").get("porthole_token") === token;
}

function isLocalAddress(address: string | undefined): boolean {
  // Fail closed: no discernible peer address means no token bypass.
  if (!address) return false;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function parseCookie(cookie: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key && value) values.set(key, value);
  }
  return values;
}
