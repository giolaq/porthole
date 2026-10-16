import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InputEvent } from "./input.js";
import { ACTOR_HEADER, formatActor, type Actor } from "./protocol.js";
import { readState, removeSession, type PortholeSessionRecord } from "./state.js";

export interface ControlClientOptions {
  port?: number;
  device?: string;
  actor?: Actor;
}

export class ControlClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status: number,
  ) {
    super(message);
  }
}

function actorHeaders(opts: ControlClientOptions): Record<string, string> {
  return {
    [ACTOR_HEADER]: formatActor(opts.actor ?? { kind: process.env["CI"] ? "ci" : "cli" }),
  };
}

export async function sendSessionInput(
  event: InputEvent,
  opts: ControlClientOptions = {},
): Promise<PortholeSessionRecord> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, "/api/input"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...actorHeaders(opts) },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    throw await responseError(res);
  }
  return session;
}

export async function fetchSessionScreenshot(
  opts: ControlClientOptions = {},
): Promise<{ session: PortholeSessionRecord; png: Uint8Array }> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, "/screenshot"), {
    headers: actorHeaders(opts),
  });
  if (!res.ok) {
    throw await responseError(res);
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
    headers: { "Content-Type": "application/json", ...actorHeaders(opts) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await responseError(res);
  }
  return { session, response: await res.json() };
}

export async function postSessionBytes(
  path: string,
  body: Uint8Array,
  filename: string,
  opts: ControlClientOptions = {},
): Promise<{ session: PortholeSessionRecord; response: unknown }> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, path), {
    method: "POST",
    headers: { ...actorHeaders(opts), "x-porthole-filename": filename },
    body: Buffer.from(body),
  });
  if (!res.ok) throw await responseError(res);
  return { session, response: await res.json() };
}

export async function getSessionJson(
  path: string,
  opts: ControlClientOptions = {},
): Promise<{ session: PortholeSessionRecord; response: unknown }> {
  const session = await discoverSession(opts);
  const res = await fetch(sessionUrl(session, path), { headers: actorHeaders(opts) });
  if (!res.ok) {
    throw await responseError(res);
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
    if (await isSessionAlive(session, opts)) {
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

async function isSessionAlive(
  session: PortholeSessionRecord,
  opts: ControlClientOptions,
): Promise<boolean> {
  try {
    const res = await fetch(sessionUrl(session, "/health"), {
      signal: AbortSignal.timeout(1000),
      headers: actorHeaders(opts),
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

async function responseError(res: Response): Promise<ControlClientError> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.error === "string") {
      return new ControlClientError(
        body.error,
        typeof body.code === "string" ? body.code : "BAD_REQUEST",
        body.retryable === true,
        res.status,
      );
    }
  } catch {
    // fall through
  }
  return new ControlClientError(
    `${res.status} ${res.statusText}`.trim(),
    "BAD_REQUEST",
    false,
    res.status,
  );
}
