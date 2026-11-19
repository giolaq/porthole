import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  readState,
  removeSession,
  upsertSession,
  type PortholeSessionRecord,
} from "../state.js";

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

function record(serial: string): PortholeSessionRecord {
  return {
    serial,
    avdName: "Pixel",
    profile: "phone",
    pid: 1,
    port: 3200,
    host: "127.0.0.1",
    url: "http://127.0.0.1:3200",
    startedAt: "2026-07-07T00:00:00.000Z",
    bootedByUs: true,
  };
}

it("keeps both concurrent registrations in one process", async () => {
  dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
  const path = join(dir, "state.json");
  const results = await Promise.allSettled([
    upsertSession(record("first"), path),
    upsertSession(record("second"), path),
  ]);

  expect(results.map(({ status }) => status)).toEqual(["fulfilled", "fulfilled"]);
  expect((await readState(path)).sessions.map(({ serial }) => serial).sort()).toEqual([
    "first",
    "second",
  ]);
});

async function createWorker(directory: string) {
  const source = await readFile(new URL("../state.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  await writeFile(join(directory, "state.mjs"), outputText);
  const worker = join(directory, "writer.mjs");
  await writeFile(
    worker,
    `
    import fs from "node:fs/promises";
    import { syncBuiltinESMExports } from "node:module";

    const [path, operation, input, pause] = process.argv.slice(2);
    if (pause) {
      const rename = fs.rename;
      fs.rename = async (...args) => {
        const resume = new Promise((resolve) => process.once("message", resolve));
        process.send("before rename");
        await resume;
        return rename(...args);
      };
      syncBuiltinESMExports();
    }
    const state = await import("./state.mjs");
    if (!pause) process.send("started");
    await state[operation](JSON.parse(input), path);
    process.disconnect();
  `,
  );
  return worker;
}

function startWriter(
  worker: string,
  path: string,
  operation: "upsertSession" | "removeSession",
  input: { serial: string },
  pause = false,
) {
  const child = fork(
    worker,
    [path, operation, JSON.stringify(input), ...(pause ? ["pause"] : [])],
    {
      execArgv: [],
    },
  );
  const exited = once(child, "exit");
  return { child, exited, started: once(child, "message") };
}

it.each([
  { operation: "upsertSession", crash: false, expected: ["existing", "first", "second"] },
  { operation: "removeSession", crash: false, expected: ["first"] },
  { operation: "upsertSession", crash: true, expected: ["existing", "second"] },
] as const)(
  "preserves concurrent updates across processes ($operation, abrupt exit: $crash)",
  async ({ operation, crash, expected }) => {
    dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
    const path = join(dir, "state.json");
    await upsertSession(record("existing"), path);
    const worker = await createWorker(dir);
    const first = startWriter(worker, path, "upsertSession", record("first"), true);
    const paused = once(first.child, "message");
    let second: ReturnType<typeof startWriter> | undefined;
    try {
      expect(await Promise.race([paused, first.exited])).toEqual([
        "before rename",
        undefined,
      ]);
      second = startWriter(
        worker,
        path,
        operation,
        operation === "upsertSession" ? record("second") : { serial: "existing" },
      );
      expect(await Promise.race([second.started, second.exited])).toEqual([
        "started",
        undefined,
      ]);
      // The old code can commit the second update while the first holds a stale snapshot.
      await Promise.race([
        second.exited,
        new Promise((resolve) => setTimeout(resolve, 200)),
      ]);
      if (crash) {
        first.child.kill("SIGKILL");
        expect(await first.exited).toEqual([null, "SIGKILL"]);
      } else {
        first.child.send("resume");
        expect(await first.exited).toEqual([0, null]);
      }
      expect(await second.exited).toEqual([0, null]);
      expect((await readState(path)).sessions.map(({ serial }) => serial).sort()).toEqual(
        expected,
      );
    } finally {
      first.child.kill("SIGKILL");
      second?.child.kill("SIGKILL");
      await Promise.all([first.exited, second?.exited]);
    }
  },
);

it("reports a failed replacement and releases the writer's claim", async () => {
  dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
  const path = join(dir, "state.json");
  await mkdir(path);
  await expect(upsertSession(record("failed"), path)).rejects.toThrow();
  await rm(path, { recursive: true });
  await upsertSession(record("recovered"), path);
  expect((await readState(path)).sessions).toEqual([record("recovered")]);
});

it("bounds contention and leaves the live writer's claim intact", async () => {
  dir = await mkdtemp(join(tmpdir(), "porthole-state-test-"));
  const path = join(dir, "state.json");
  const worker = await createWorker(dir);
  const first = startWriter(worker, path, "upsertSession", record("first"), true);
  try {
    expect(await Promise.race([first.started, first.exited])).toEqual([
      "before rename",
      undefined,
    ]);
    await expect(upsertSession(record("blocked"), path)).rejects.toThrow(
      "Timed out waiting to update session registry",
    );
    first.child.send("resume");
    expect(await first.exited).toEqual([0, null]);
    expect((await readState(path)).sessions).toEqual([record("first")]);
  } finally {
    first.child.kill("SIGKILL");
    await first.exited;
  }
}, 12_000);
