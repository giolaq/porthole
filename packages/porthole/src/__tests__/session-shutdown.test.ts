import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { expect, it, vi } from "vitest";
import { FakeEngine } from "./helpers/fake-engine.js";
import * as paths from "../paths.js";
import { Session } from "../session.js";
import { readState } from "../state.js";

vi.mock("../engine/scrcpy-engine.js", () => ({ ScrcpyEngine: FakeEngine }));

it("disconnects a live preview and removes its session record during shutdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "porthole-shutdown-"));
  vi.stubEnv("PORTHOLE_STATE_FILE", join(directory, "state.json"));
  const session = new Session({
    device: {
      name: "Pixel",
      serial: "emulator-5554",
      profile: "phone",
      state: "running",
    },
    host: "127.0.0.1",
    port: 0,
  });
  const asset = vi.spyOn(paths, "scrcpyServerPath").mockReturnValue("unused");
  let client: WebSocket | undefined;
  try {
    await session.start();
    const address = session["server"]?.address();
    if (!address || typeof address === "string") throw new Error("Missing TCP address");
    client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await once(client, "open");
    expect((await readState()).sessions).toHaveLength(1);
    const closing = Promise.all([session.stop(), session.stop()]);
    await vi.waitFor(() => expect(client?.readyState).toBe(WebSocket.CLOSED), {
      timeout: 1500,
    });
    await closing;
    expect((await readState()).sessions).toEqual([]);
  } finally {
    client?.terminate();
    await session.stop();
    asset.mockRestore();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
