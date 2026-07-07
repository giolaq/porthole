import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { findAndroidSdk, emulatorBin, adbBin, parseAvdList } from "../device-manager.js";

const exe = process.platform === "win32" ? ".exe" : "";

describe("device-manager utilities", () => {
  it("findAndroidSdk uses ANDROID_HOME if set", () => {
    const original = process.env["ANDROID_HOME"];
    process.env["ANDROID_HOME"] = "/fake/sdk";
    try {
      expect(findAndroidSdk()).toBe("/fake/sdk");
    } finally {
      if (original !== undefined) {
        process.env["ANDROID_HOME"] = original;
      } else {
        delete process.env["ANDROID_HOME"];
      }
    }
  });

  it("emulatorBin produces correct path", () => {
    expect(emulatorBin("/sdk")).toBe(join("/sdk", "emulator", `emulator${exe}`));
  });

  it("adbBin produces correct path", () => {
    expect(adbBin("/sdk")).toBe(join("/sdk", "platform-tools", `adb${exe}`));
  });

  it("filters emulator diagnostics from AVD list output", () => {
    expect(
      parseAvdList(`
INFO | Storing crashdata in: /tmp/foo
Pixel_8_Pro_API_34
WARNING | noisy
Android_TV_1080p
bad name with spaces
`),
    ).toEqual(["Pixel_8_Pro_API_34", "Android_TV_1080p"]);
  });
});
