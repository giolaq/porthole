import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { discoverSession } from "../control-client.js";
import { readState, writeState, type PortholeSessionRecord } from "../state.js";

const session: PortholeSessionRecord = {
  serial: "emulator-5554",
  avdName: "Pixel",
  profile: "phone",
  pid: process.pid,
  port: 3200,
  host: "127.0.0.1",
  url: "http://127.0.0.1:3200",
  startedAt: "2026-07-07T00:00:01.000Z",
  bootedByUs: true,
};

let dir: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "porthole-discovery-test-"));
  vi.stubEnv("PORTHOLE_STATE_FILE", join(dir, "state.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

it("rediscovers the same session after its health endpoint recovers", async () => {
  await writeState({ sessions: [session] });
  const fetchHealth = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchHealth);

  await expect(discoverSession()).rejects.toThrow("No running Porthole session");
  await expect(discoverSession()).resolves.toEqual(session);
  expect(fetchHealth).toHaveBeenCalledTimes(2);
});

it("prunes a session whose PID probe reports ESRCH", async () => {
  await writeState({ sessions: [session] });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  const probe = vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("No such process"), { code: "ESRCH" });
  });

  await expect(discoverSession()).rejects.toThrow("No running Porthole session");
  expect((await readState()).sessions).toEqual([]);
  expect(probe).toHaveBeenCalledWith(session.pid, 0);
});

it("preserves a replacement registered on the same port during the health check", async () => {
  await writeState({ sessions: [session] });
  const replacement = { ...session, pid: session.pid + 1 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await writeState({ sessions: [replacement] });
      return new Response(null, { status: 503 });
    }),
  );
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("No such process"), { code: "ESRCH" });
  });

  await expect(discoverSession()).rejects.toThrow("No running Porthole session");
  expect((await readState()).sessions).toEqual([replacement]);
});

it("falls back to an older candidate and retains a session when the PID probe reports EPERM", async () => {
  const fallback = {
    ...session,
    serial: "emulator-5556",
    startedAt: "2026-07-07T00:00:00.000Z",
  };
  await writeState({ sessions: [fallback, session] });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })),
  );
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
  });

  await expect(discoverSession()).resolves.toEqual(fallback);
  expect((await readState()).sessions).toEqual([fallback, session]);
});
