import { describe, expect, it } from "vitest";
import type { DeviceInfo } from "../device-manager.js";
import { resolveTarget } from "../target-resolution.js";

const devices: DeviceInfo[] = [
  { name: "Pixel", serial: null, profile: "phone", state: "stopped" },
  { name: "TV", serial: "emulator-5554", profile: "tv", state: "running" },
  { name: "Offline", serial: "emulator-5556", profile: "phone", state: "offline" },
];

describe("resolveTarget", () => {
  it("boots a named stopped AVD instead of attaching to its empty serial", () => {
    expect(resolveTarget(devices, "Pixel")).toEqual({
      action: "boot",
      avdName: "Pixel",
      profile: "phone",
    });
  });

  it("attaches to a running named AVD", () => {
    const result = resolveTarget(devices, "TV");
    expect(result.action).toBe("attach");
  });

  it("requires --device to match a running or offline serial", () => {
    expect(resolveTarget(devices, undefined, "missing")).toEqual({
      action: "error",
      message: "No running emulator with serial missing.",
    });
  });

  it("returns an offline serial for reconnect handling", () => {
    const result = resolveTarget(devices, undefined, "emulator-5556");
    expect(result.action).toBe("attach");
  });
});
