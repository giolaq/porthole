import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readState, removeSession, upsertSession } from "../state.js";

let dir: string | null = null;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("state file", () => {
  it("merges sessions by serial", async () => {
    dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
    const path = join(dir, "state.json");
    await upsertSession(
      {
        serial: "emulator-5554",
        avdName: "Pixel",
        profile: "phone",
        pid: 1,
        port: 3200,
        host: "127.0.0.1",
        url: "http://127.0.0.1:3200",
        startedAt: "2026-07-07T00:00:00.000Z",
        bootedByUs: true,
      },
      path,
    );
    await upsertSession(
      {
        serial: "emulator-5554",
        avdName: "Pixel",
        profile: "phone",
        pid: 2,
        port: 3201,
        host: "127.0.0.1",
        url: "http://127.0.0.1:3201",
        startedAt: "2026-07-07T00:00:01.000Z",
        bootedByUs: true,
      },
      path,
    );

    expect((await readState(path)).sessions).toHaveLength(1);
    expect((await readState(path)).sessions[0]?.port).toBe(3201);
  });

  it("keeps multiple serials on one server port", async () => {
    dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
    const path = join(dir, "state.json");
    const base = {
      pid: 1,
      port: 3200,
      host: "127.0.0.1",
      url: "http://127.0.0.1:3200",
      startedAt: "2026-07-07T00:00:00.000Z",
      bootedByUs: true,
    };
    await upsertSession(
      {
        ...base,
        serial: "emulator-5554",
        avdName: "Pixel",
        profile: "phone",
      },
      path,
    );
    await upsertSession(
      {
        ...base,
        serial: "emulator-5556",
        avdName: "TV",
        profile: "tv",
      },
      path,
    );

    expect((await readState(path)).sessions.map((session) => session.serial)).toEqual([
      "emulator-5554",
      "emulator-5556",
    ]);
  });

  it("removes matching sessions", async () => {
    dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
    const path = join(dir, "state.json");
    await upsertSession(
      {
        serial: "emulator-5554",
        avdName: "Pixel",
        profile: "phone",
        pid: 1,
        port: 3200,
        host: "127.0.0.1",
        url: "http://127.0.0.1:3200",
        startedAt: "2026-07-07T00:00:00.000Z",
        bootedByUs: false,
      },
      path,
    );

    await removeSession({ port: 3200 }, path);
    expect((await readState(path)).sessions).toEqual([]);
  });
});
