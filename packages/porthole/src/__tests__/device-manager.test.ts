import { describe, it, expect } from "vitest";
import { findAndroidSdk, emulatorBin, adbBin } from "../device-manager.js";

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
    const bin = emulatorBin("/sdk");
    expect(bin).toContain("emulator");
    expect(bin.startsWith("/sdk/")).toBe(true);
  });

  it("adbBin produces correct path", () => {
    const bin = adbBin("/sdk");
    expect(bin).toContain("platform-tools");
    expect(bin.startsWith("/sdk/")).toBe(true);
  });
});
