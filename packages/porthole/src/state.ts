import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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
  await withStateLock(path, (path, temporary) => replaceState(state, path, temporary));
}

async function replaceState(state: PortholeState, path: string, temporary: string) {
  await writeFile(temporary, JSON.stringify(state, null, 2) + "\n");
  await rename(temporary, path);
}

export async function upsertSession(
  record: PortholeSessionRecord,
  path = statePath(),
): Promise<void> {
  await withStateLock(path, async (path, temporary) => {
    const state = await readState(path);
    const sessions = state.sessions.filter((session) => session.serial !== record.serial);
    sessions.push(record);
    await replaceState({ sessions }, path, temporary);
  });
}

export async function removeSession(
  match: { serial?: string; port?: number; pid?: number },
  path = statePath(),
): Promise<void> {
  await withStateLock(path, async (path, temporary) => {
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

    await replaceState({ sessions }, path, temporary);
  });
}

async function withStateLock(
  path: string,
  update: (path: string, temporary: string) => Promise<void>,
): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  path = join(await realpath(parent), basename(path));
  const lock = `${path}.lock`;
  await mkdir(lock, { recursive: true });
  const own = await mkdtemp(join(lock, `${process.pid}-`));
  const deadline = performance.now() + 5000;

  try {
    // Lamport's bakery algorithm. Publishing our directory announces that we're
    // choosing a ticket. The smallest (ticket, directory name) goes first.
    const observed = await Promise.all(
      (await contenders(lock)).map((name) => readTicket(join(lock, name))),
    );
    const ticket = Math.max(0, ...observed) + 1;
    await mkdir(join(own, String(ticket)));

    for (const name of await contenders(lock)) {
      const other = join(lock, name);
      if (other === own) continue;
      for (;;) {
        if (processExited(Number(name.split("-")[0]))) {
          await rm(other, { recursive: true, force: true });
          break;
        }
        const current = await readTicket(other);
        if (current === -1 || current > ticket || (current === ticket && other > own)) {
          break;
        }
        if (performance.now() >= deadline) {
          throw new Error(`Timed out waiting to update session registry at ${path}`);
        }
        await delay(20);
      }
    }

    await update(path, join(own, "state.tmp"));
  } finally {
    await rm(own, { recursive: true, force: true });
  }
}

async function contenders(lock: string) {
  return (await readdir(lock)).filter((name) => /^[1-9]\d*-[a-zA-Z0-9]+$/.test(name));
}

async function readTicket(directory: string): Promise<number> {
  try {
    const entries = await readdir(directory);
    return Number(entries.find((entry) => /^\d+$/.test(entry)) ?? 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return -1;
    throw error;
  }
}

function processExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
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
