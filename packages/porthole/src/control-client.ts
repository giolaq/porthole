import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InputEvent } from "./input.js";
import { readState, removeSession, type PortholeSessionRecord } from "./state.js";

export interface ControlClientOptions {
  port?: number;
  device?: string;
}

export async function sendSessionInput(
  event: InputEvent,
  opts: ControlClientOptions = {},
): Promise<PortholeSessionRecord> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, "/api/input"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    throw new Error(await responseError(res));
  }
  return session;
}

export async function fetchSessionScreenshot(
  opts: ControlClientOptions = {},
): Promise<{ session: PortholeSessionRecord; png: Uint8Array }> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, "/screenshot"));
  if (!res.ok) {
    throw new Error(await responseError(res));
  }
  return {
    session,
    png: new Uint8Array(await res.arrayBuffer()),
  };
}

export async function postSessionJson(
  path: string,
  body: unknown,
  opts: ControlClientOptions = {},
): Promise<{ session: PortholeSessionRecord; response: unknown }> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await responseError(res));
  }
  return { session, response: await res.json() };
}

export async function getSessionJson(
  path: string,
  opts: ControlClientOptions = {},
): Promise<{ session: PortholeSessionRecord; response: unknown }> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, path));
  if (!res.ok) {
    throw new Error(await responseError(res));
  }
  return { session, response: await res.json() };
}

export async function discoverSession(
  opts: ControlClientOptions = {},
): Promise<PortholeSessionRecord> {
  const state = await readState();
  const candidates = state.sessions
    .filter((session) => opts.port === undefined || session.port === opts.port)
    .filter((session) => opts.device === undefined || session.serial === opts.device)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const session of candidates) {
    if (await isSessionAlive(session)) {
      return session;
    }
    await removeSession({ port: session.port, pid: session.pid });
  }

  throw new Error(
    opts.port === undefined
      ? "No running Porthole session found. Start one with `porthole start`."
      : opts.device === undefined
        ? `No running Porthole session found on port ${opts.port}.`
        : `No running Porthole session found for ${opts.device} on port ${opts.port}.`,
  );
}

export function defaultScreenshotPath(serial: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return join(process.cwd(), `porthole-${serial}-${stamp}.png`);
}

export async function writeScreenshot(path: string, png: Uint8Array): Promise<void> {
  await writeFile(path, png);
}

async function isSessionAlive(session: PortholeSessionRecord): Promise<boolean> {
  try {
    const res = await fetch(sessionUrl(session, "/health"), {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function sessionUrl(session: PortholeSessionRecord, path: string): string {
  const url = new URL(session.url);
  const token = url.searchParams.get("token");
  const requested = new URL(path, url);
  url.pathname = requested.pathname;
  url.search = "";
  for (const [key, value] of requested.searchParams) {
    url.searchParams.set(key, value);
  }
  if (token) url.searchParams.set("token", token);
  url.searchParams.set("device", session.serial);
  return url.toString();
}

async function responseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.error === "string") return body.error;
  } catch {
    // fall through
  }
  return `${res.status} ${res.statusText}`.trim();
}
