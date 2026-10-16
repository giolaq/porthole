import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHttpServer } from "../server/http.js";
import { FakeEngine } from "./helpers/fake-engine.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function start() {
  const engine = new FakeEngine();
  const { server, listen } = createHttpServer({
    port: 0,
    host: "127.0.0.1",
    clientDir: "/does-not-exist",
    getEngine: () => engine,
    getDevices: () => [],
  });
  servers.push(server);
  await listen();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return { base: `http://127.0.0.1:${address.port}`, engine };
}

describe("HTTP route contract", () => {
  it("serves health, devices, state, and PNG screenshot", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect(await (await fetch(`${base}/api/devices`)).json()).toEqual([]);
    expect((await fetch(`${base}/api/state`)).status).toBe(200);
    const png = await fetch(`${base}/screenshot`);
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect((await png.arrayBuffer()).byteLength).toBeGreaterThan(8);
  });

  it.each([
    ["POST", "/api/input"],
    ["POST", "/api/rotate"],
    ["POST", "/api/emu"],
    ["GET", "/api/ui"],
    ["GET", "/api/focused"],
    ["POST", "/api/focus_on"],
    ["POST", "/api/find"],
    ["POST", "/api/wait_for"],
    ["POST", "/api/open_url"],
    ["POST", "/api/stop_app"],
    ["POST", "/api/clear_app"],
    ["GET", "/api/apps"],
    ["POST", "/api/launch"],
    ["POST", "/api/install"],
    ["POST", "/api/push"],
    ["GET", "/api/logcat"],
    ["GET", "/api/crashes"],
  ])("preserves missing-device response for %s %s", async (method, path) => {
    const { base } = await start();
    const response = await fetch(base + path, { method });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "No active device.",
      code: "NO_DEVICE",
      retryable: false,
    });
  });
});
