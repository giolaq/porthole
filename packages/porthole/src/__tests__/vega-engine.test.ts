import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: new Set<string>(),
  exec: vi.fn(),
  portFree: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: (path: string) => mocks.files.has(path),
  readdirSync: () => ["0.9.1", "0.24.12112"],
}));
vi.mock("node:os", () => ({ homedir: () => "/home/test", tmpdir: () => "/tmp" }));
vi.mock("node:child_process", () => ({ execFile: mocks.exec }));
vi.mock("../port-check.js", () => ({ isPortFree: mocks.portFree }));
vi.mock("node:net", () => ({
  createConnection: () => {
    const socket = Object.assign(new EventEmitter(), {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
    });
    queueMicrotask(() => socket.emit("data", Buffer.from("Android Console\nOK\n")));
    return socket;
  },
}));
import {
  ensureVegaVirtualDevice,
  isVegaConsoleUp,
  resolveVdaBin,
  resolveVegaCli,
} from "../engine/vega-engine.js";

beforeEach(() => {
  vi.stubEnv("PATH", "/tools");
  vi.stubEnv("PORTHOLE_VEGA_BIN", "");
  vi.stubEnv("PORTHOLE_VDA_BIN", "");
  mocks.files.clear();
  mocks.exec.mockReset();
  mocks.portFree.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

function output(stdout: string) {
  return (
    _file: string,
    _args: string[],
    _opts: unknown,
    callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => callback(null, { stdout, stderr: "" });
}

// util.promisify(execFile) normally uses Node's custom promisifier. Our mock
// returns the same stdout/stderr object via its callback.
describe("Vega SDK discovery", () => {
  it("prefers the active launcher over an older SDK", () => {
    mocks.files.add("/tools/vega");
    mocks.files.add("/home/test/vega/sdk/0.9.1/bin/vega");
    expect(resolveVegaCli()).toBe("/tools/vega");
  });
  it("uses vega which to resolve a component-managed SDK", async () => {
    mocks.files.add("/tools/vega");
    const vda = "/custom/sdk/vega-sdk/main/0.24.12112/component/bin/vda";
    mocks.files.add(vda);
    mocks.exec.mockImplementation(output(vda + "\n"));
    expect(await resolveVdaBin()).toBe(vda);
    expect(mocks.exec.mock.calls[0]?.slice(0, 2)).toEqual([
      "/tools/vega",
      ["which", "vda"],
    ]);
  });
  it("honors explicit overrides and rejects missing ones", async () => {
    vi.stubEnv("PORTHOLE_VDA_BIN", "/explicit/vda");
    mocks.files.add("/explicit/vda");
    expect(await resolveVdaBin()).toBe("/explicit/vda");
    vi.stubEnv("PORTHOLE_VEGA_BIN", "/missing/vega");
    expect(() => resolveVegaCli()).toThrow("PORTHOLE_VEGA_BIN not found");
  });
  it("sorts legacy SDK versions numerically", () => {
    mocks.files.add("/home/test/vega/sdk");
    mocks.files.add("/home/test/vega/sdk/0.9.1/bin/vega");
    mocks.files.add("/home/test/vega/sdk/0.24.12112/bin/vega");
    expect(resolveVegaCli()).toContain("0.24.12112/bin/vega");
  });
});

describe("Vega startup", () => {
  beforeEach(() => mocks.files.add("/tools/vega"));
  it("does not identify an Android console as Vega", async () => {
    mocks.exec.mockImplementation(output('{"running":false}'));
    expect(await isVegaConsoleUp()).toBe(false);
    mocks.portFree.mockResolvedValue(false);
    await expect(ensureVegaVirtualDevice()).rejects.toThrow(
      "occupied by another process",
    );
    expect(mocks.exec.mock.calls.every((call) => call[1][1] === "status")).toBe(true);
  });
  it("attaches to a confirmed VVD without booting another", async () => {
    mocks.exec.mockImplementation(output('{"running":true}'));
    await expect(ensureVegaVirtualDevice()).resolves.toBeUndefined();
    expect(mocks.portFree).not.toHaveBeenCalled();
  });
  it("boots and confirms a new VVD when both ports are free", async () => {
    mocks.exec
      .mockImplementationOnce(output('{"running":false}'))
      .mockImplementationOnce(output("Virtual device ready."))
      .mockImplementationOnce(output('{"running":true}'));
    await expect(ensureVegaVirtualDevice()).resolves.toBeUndefined();
    expect(mocks.exec.mock.calls[1]?.slice(0, 2)).toEqual([
      "/tools/vega",
      ["virtual-device", "start", "--no-gui", "--timeout", "240"],
    ]);
  });
  it("rejects a collision on the transport port too", async () => {
    mocks.exec.mockImplementation(output('{"running":false}'));
    mocks.portFree.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(ensureVegaVirtualDevice()).rejects.toThrow("port 5555");
    expect(mocks.exec).toHaveBeenCalledTimes(1);
  });
  it("verifies the VVD is alive after starting", async () => {
    mocks.exec
      .mockImplementationOnce(output('{"running":false}'))
      .mockImplementationOnce(output("Virtual device ready."))
      .mockImplementationOnce(output('{"running":false}'));
    await expect(ensureVegaVirtualDevice()).rejects.toThrow("reported ready");
  });
});
