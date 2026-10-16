import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHttpServer } from "../server/http.js";
import { hasMp4Box } from "../mp4-writer.js";
import { FakeEngine } from "./helpers/fake-engine.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

const config = Uint8Array.of(
  0,
  0,
  0,
  1,
  0x67,
  0x42,
  0,
  0x1f,
  0,
  0,
  0,
  1,
  0x68,
  0xce,
  0x06,
  0xe2,
);
const frame = Uint8Array.of(0, 0, 0, 1, 0x65, 0x88);

describe("recording routes", () => {
  it("records one stream per device and writes a valid MP4", async () => {
    const dir = await mkdtemp(join(tmpdir(), "porthole-record-test-"));
    const engine = new FakeEngine();
    const { server, listen } = createHttpServer({
      port: 0,
      host: "127.0.0.1",
      clientDir: dir,
      getEngine: () => engine,
      getDevice: () => ({
        name: "Test",
        serial: "emulator-5554",
        profile: "phone",
        state: "running",
      }),
    });
    await listen();
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    cleanup.push(async () => {
      await new Promise<void>((resolve) => (server as Server).close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: object) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const output = join(dir, "capture.mp4");
    expect((await post("/api/recording/start", { path: output })).status).toBe(200);
    const duplicate = await post("/api/recording/start", { path: output });
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { code: string }).code).toBe("RECORDING_ACTIVE");
    engine.emitChunk({ type: "config", data: config });
    engine.emitChunk({ type: "frame", data: frame, timestamp: 33_333, keyframe: true });
    const stopped = await post("/api/recording/stop", {});
    expect(stopped.status).toBe(200);
    const result = (await stopped.json()) as { bytes: number; path: string };
    expect(result.path).toBe(output);
    expect(result.bytes).toBeGreaterThan(0);
    expect(hasMp4Box(await readFile(output), "ftyp")).toBe(true);
  });
});
