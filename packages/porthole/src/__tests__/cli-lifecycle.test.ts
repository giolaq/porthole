import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../cli/lifecycle.js";
import {
  bootDevice,
  listDevices,
  shutdownDevice,
  wasBootedByUs,
  type DeviceInfo,
} from "../device-manager.js";
import { Session } from "../session.js";
import { readState, removeSession, type PortholeSessionRecord } from "../state.js";

vi.mock("../device-manager.js", () => ({
  findAndroidSdk: () => "fake-sdk",
  listDevices: vi.fn(),
  bootDevice: vi.fn(),
  reconnectOfflineDevices: vi.fn(),
  shutdownDevice: vi.fn(),
  wasBootedByUs: vi.fn(),
}));
vi.mock("../session.js", () => ({ Session: vi.fn() }));
vi.mock("../state.js", () => ({ readState: vi.fn(), removeSession: vi.fn() }));
vi.mock("../port-check.js", () => ({ ensurePortFree: vi.fn() }));
vi.mock("../index.js", () => ({ VERSION: "test" }));
vi.mock("../mcp/server.js", () => ({ startMcpServer: vi.fn() }));

const url = "http://127.0.0.1:3200";
const attached = {
  name: "Attached",
  serial: "emulator-5554",
  profile: "phone",
  state: "running",
} satisfies DeviceInfo;
const owned = {
  ...attached,
  name: "Owned",
  serial: "emulator-5556",
};
const detachedPid = process.pid + 1;

function records(detached: boolean): PortholeSessionRecord[] {
  return [attached, owned].map((device) => ({
    serial: device.serial,
    avdName: device.name,
    profile: device.profile,
    bootedByUs: device === owned,
    pid: detached ? detachedPid : process.pid,
    detached,
    port: 3200,
    host: "127.0.0.1",
    url,
    startedAt: "2026-01-01T00:00:00.000Z",
  }));
}

function cli(...args: string[]) {
  const program = new Command();
  register(program);
  return program.parseAsync([...args, "--quiet"], { from: "user" });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PORTHOLE_DETACHED_CHILD", undefined);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.spyOn(process, "kill").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("CLI signal shutdown", () => {
  it.each([
    { signal: "SIGINT", detached: false, keepAlive: false },
    { signal: "SIGTERM", detached: true, keepAlive: false },
    { signal: "SIGTERM", detached: true, keepAlive: true },
  ] as const)(
    "handles $signal with detached=$detached and keepAlive=$keepAlive",
    async ({ signal, detached, keepAlive }) => {
      if (detached) vi.stubEnv("PORTHOLE_DETACHED_CHILD", "1");
      vi.mocked(listDevices)
        .mockResolvedValueOnce([attached, { ...owned, state: "stopped", serial: null }])
        .mockResolvedValueOnce([attached, owned]);
      vi.mocked(bootDevice).mockResolvedValue(owned.serial);
      const stop = vi.fn().mockResolvedValue(undefined);
      vi.mocked(Session).mockImplementation(function () {
        return { start: async () => ({ url }), stop } as unknown as Session;
      });
      const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
      const signals = ["SIGINT", "SIGTERM"] as const;
      const originalListeners = signals.map((event) => process.listeners(event));
      const addedListeners = (event: (typeof signals)[number]) =>
        process
          .listeners(event)
          .filter(
            (listener) => !originalListeners[signals.indexOf(event)]?.includes(listener),
          );

      try {
        await cli(
          "start",
          attached.name,
          owned.name,
          "--no-preview",
          ...(keepAlive ? ["--keep-alive"] : []),
        );
        expect(Session).toHaveBeenCalledWith(expect.objectContaining({ detached }));
        const listeners = addedListeners(signal);
        expect(listeners).toHaveLength(1);
        listeners[0]?.(signal);
        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
        expect(stop).toHaveBeenCalledOnce();
        expect(vi.mocked(shutdownDevice).mock.calls).toEqual(
          keepAlive ? [] : [["fake-sdk", owned.serial]],
        );
      } finally {
        for (const event of signals) {
          for (const listener of addedListeners(event)) process.off(event, listener);
        }
      }
    },
  );
});

describe("CLI kill", () => {
  beforeEach(() => {
    vi.mocked(listDevices).mockResolvedValue([attached, owned]);
    vi.mocked(wasBootedByUs).mockImplementation(
      async (serial) => serial === owned.serial,
    );
  });

  it.each([false, true])(
    "only shuts down owned emulators by default (detached=%s)",
    async (detached) => {
      vi.mocked(readState).mockResolvedValue({ sessions: records(detached) });

      await cli("kill");

      expect(process.kill).toHaveBeenCalledTimes(detached ? 1 : 0);
      if (detached) expect(process.kill).toHaveBeenCalledWith(detachedPid, "SIGTERM");
      expect(vi.mocked(shutdownDevice).mock.calls).toEqual([["fake-sdk", owned.serial]]);
      expect(process.stdout.write).toHaveBeenCalledWith(
        JSON.stringify({ killed: [owned.serial] }) + "\n",
      );
    },
  );

  it("closes a detached attached-only session and leaves its emulator running", async () => {
    vi.mocked(listDevices).mockResolvedValue([attached]);
    vi.mocked(readState).mockResolvedValue({
      sessions: records(true).filter((session) => !session.bootedByUs),
    });

    await cli("kill");

    expect(process.kill).toHaveBeenCalledExactlyOnceWith(detachedPid, "SIGTERM");
    expect(shutdownDevice).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('{"killed":[]}\n');
  });

  it("kills an explicitly named attached AVD without signaling its shared server", async () => {
    vi.mocked(readState).mockResolvedValue({ sessions: records(true) });

    await cli("kill", attached.name);

    expect(process.kill).not.toHaveBeenCalled();
    expect(removeSession).toHaveBeenCalledWith({ serial: attached.serial });
    expect(vi.mocked(shutdownDevice).mock.calls).toEqual([["fake-sdk", attached.serial]]);
  });

  it("does nothing for an unknown AVD", async () => {
    vi.mocked(readState).mockResolvedValue({ sessions: records(true) });

    await cli("kill", "Unknown");

    expect(process.kill).not.toHaveBeenCalled();
    expect(shutdownDevice).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledWith('{"killed":[]}\n');
  });
});
