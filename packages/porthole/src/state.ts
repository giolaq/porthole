import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DeviceProfile } from "./profiles.js";

export interface PortholeSessionRecord {
  serial: string;
  avdName: string;
  profile: DeviceProfile;
  pid: number;
  port: number;
  host: string;
  url: string;
  startedAt: string;
  bootedByUs: boolean;
  detached?: boolean;
}

export interface PortholeState {
  sessions: PortholeSessionRecord[];
}

export function statePath(): string {
  return process.env["PORTHOLE_STATE_FILE"] ?? join(tmpdir(), "porthole", "state.json");
}

export async function readState(path = statePath()): Promise<PortholeState> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<PortholeState>;
    return {
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.filter(isSessionRecord)
        : [],
    };
  } catch {
    return { sessions: [] };
  }
}

export async function writeState(
  state: PortholeState,
  path = statePath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2) + "\n");
  await rename(tmpPath, path);
}

export async function upsertSession(
  record: PortholeSessionRecord,
  path = statePath(),
): Promise<void> {
  const state = await readState(path);
  const sessions = state.sessions.filter((session) => session.serial !== record.serial);
  sessions.push(record);
  await writeState({ sessions }, path);
}

export async function removeSession(
  match: { serial?: string; port?: number; pid?: number },
  path = statePath(),
): Promise<void> {
  const state = await readState(path);
  const sessions = state.sessions.filter((session) => {
    if (match.serial && session.serial === match.serial) return false;
    if (match.port !== undefined && session.port === match.port) return false;
    if (match.pid !== undefined && session.pid === match.pid) return false;
    return true;
  });

  if (sessions.length === 0) {
    await rm(path, { force: true });
    return;
  }

  await writeState({ sessions }, path);
}

export async function isSerialBootedByPorthole(serial: string): Promise<boolean> {
  const state = await readState();
  return state.sessions.some(
    (session) => session.serial === serial && session.bootedByUs,
  );
}

function isSessionRecord(value: unknown): value is PortholeSessionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.serial === "string" &&
    typeof record.avdName === "string" &&
    (record.profile === "phone" || record.profile === "tv") &&
    typeof record.pid === "number" &&
    typeof record.port === "number" &&
    typeof record.host === "string" &&
    typeof record.url === "string" &&
    typeof record.startedAt === "string" &&
    typeof record.bootedByUs === "boolean"
  );
}
