import type { IncomingMessage, ServerResponse } from "node:http";
import { basename } from "node:path";
import type { DeviceInfo } from "../device-manager.js";
import type { HttpServerOptions } from "./http.js";
import type { MjpegPoller } from "./mjpeg.js";
import type { ActionContext, SessionHandle } from "../actions/context.js";
import { ACTOR_HEADER, parseActor } from "../protocol.js";
import { asPortholeError } from "../actions/errors.js";
import { actionDevice } from "../actions/context.js";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  deviceId?: string;
  opts: HttpServerOptions;
  mjpegPollers: Map<string, MjpegPoller>;
  params?: Record<string, string>;
}
export interface Route {
  method: "GET" | "POST" | "DELETE";
  path: string;
  handler(ctx: RouteContext): Promise<void>;
}

const fallbackSessions = new WeakMap<HttpServerOptions, SessionHandle>();

export function actionContext(ctx: RouteContext): ActionContext {
  const { opts, deviceId } = ctx;
  let session = opts.sessionHandle ?? fallbackSessions.get(opts);
  if (!session) {
    session = {
      getEngine: opts.getEngine,
      getDevice: (id) => opts.getDevice?.(id),
      serial: (id) => opts.getDevice?.(id)?.serial ?? "",
      defaultDeviceId: () => opts.getDevice?.()?.serial ?? "",
      activityBus: opts.activityBus,
      getControlState: opts.getControlState,
      sendInput: async (event, id) => {
        if (opts.handleInput) return opts.handleInput(event, id);
        const engine = opts.getEngine(id);
        if (!engine) throw new Error("No active engine.");
        await engine.sendInput(event);
      },
    };
    fallbackSessions.set(opts, session);
  }
  return {
    session,
    deviceId: deviceId ?? session.defaultDeviceId(),
    actor: parseActor(ctx.req.headers[ACTOR_HEADER] as string | undefined, {
      kind: "cli",
    }),
  };
}

export async function sendActionError(
  res: ServerResponse,
  error: unknown,
): Promise<void> {
  const result = asPortholeError(error);
  await sendJson(res, result.httpStatus, {
    ok: false,
    error: result.message,
    code: result.code,
    retryable: result.retryable,
  });
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
    const params = matchPath(item.path, url.pathname);
    if (!params) return false;
    if (item.method === req.method) return true;
    // These two endpoints historically ignored the request method.
    return (
      (url.pathname === "/health" || url.pathname === "/screenshot") &&
      item.method === "GET"
    );
  });
  if (!route) return false;
  ctx.params = matchPath(route.path, url.pathname) ?? undefined;
  try {
    if (
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/state" &&
      url.pathname !== "/api/devices"
    ) {
      actionDevice(actionContext(ctx));
    }
    await route.handler(ctx);
  } catch (error) {
    if (res.headersSent) throw error;
    await sendActionError(res, error);
  }
  return true;
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split("/");
  const actual = path.split("/");
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    const part = expected[i];
    const value = actual[i];
    if (!part || value === undefined) continue;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  return params;
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
