import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { detectProfile, type DeviceProfile } from "./profiles.js";
import { isSerialBootedByPorthole, removeSession } from "./state.js";

const execFileAsync = promisify(execFile);

export interface DeviceInfo {
  name: string;
  serial: string | null;
  profile: DeviceProfile;
  state: "running" | "stopped" | "offline";
}

export function findAndroidSdk(): string {
  const sdk =
    process.env["ANDROID_HOME"] ?? process.env["ANDROID_SDK_ROOT"] ?? defaultSdkPath();
  if (!sdk) {
    throw new Error("Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT.");
  }
  return sdk;
}

function defaultSdkPath(): string | undefined {
  switch (process.platform) {
    case "darwin":
      return join(process.env["HOME"] ?? "/", "Library/Android/sdk");
    case "linux":
      return join(process.env["HOME"] ?? "/", "Android/Sdk");
    case "win32":
      return join(
        process.env["LOCALAPPDATA"] ?? "C:\\Users\\Default\\AppData\\Local",
        "Android\\Sdk",
      );
    default:
      return undefined;
  }
}

export function emulatorBin(sdk: string): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(sdk, "emulator", `emulator${ext}`);
}

export function adbBin(sdk: string): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(sdk, "platform-tools", `adb${ext}`);
}

export async function listAvds(sdk: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(emulatorBin(sdk), ["-list-avds"]);
    return parseAvdList(stdout);
  } catch {
    return [];
  }
}

export function parseAvdList(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(INFO|WARNING|ERROR)\s*\|/.test(line))
    .filter((line) => /^[A-Za-z0-9._-]+$/.test(line));
}

export interface AdbDevice {
  serial: string;
  status: "device" | "offline";
}

export async function listRunningDevices(sdk: string): Promise<AdbDevice[]> {
  try {
    const { stdout } = await execFileAsync(adbBin(sdk), ["devices"]);
    const lines = stdout.split("\n").slice(1);
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const serial = parts[0];
        const status = parts[1];
        if (
          parts.length >= 2 &&
          serial &&
          (status === "device" || status === "offline")
        ) {
          return { serial, status };
        }
        return null;
      })
      .filter(
        (d): d is AdbDevice =>
          d !== null && (d.status === "device" || d.status === "offline"),
      );
  } catch {
    return [];
  }
}

export function avdDir(): string {
  return (
    process.env["ANDROID_AVD_HOME"] ??
    join(process.env["HOME"] ?? process.env["USERPROFILE"] ?? "/", ".android/avd")
  );
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const sdk = findAndroidSdk();
  const [avds, running] = await Promise.all([listAvds(sdk), listRunningDevices(sdk)]);

  const runningNames = new Map<string, AdbDevice>();
  const namedSerials = new Set<string>();
  for (const dev of running) {
    if (dev.serial.startsWith("emulator-") && dev.status === "device") {
      try {
        const { stdout } = await execFileAsync(adbBin(sdk), [
          "-s",
          dev.serial,
          "emu",
          "avd",
          "name",
        ]);
        const name = stdout.split("\n")[0]?.trim();
        if (name) {
          runningNames.set(name, dev);
          namedSerials.add(dev.serial);
        }
      } catch {
        // ignore — can't determine AVD name
      }
    }
  }

  const avdBase = avdDir();
  const devices: DeviceInfo[] = [];

  for (const name of avds) {
    const runningDevice = runningNames.get(name);
    const serial = runningDevice?.serial ?? null;
    const avdPath = join(avdBase, `${name}.avd`);
    const profile = await detectProfile(avdPath);
    devices.push({
      name,
      serial,
      profile,
      state:
        runningDevice?.status === "offline" ? "offline" : serial ? "running" : "stopped",
    });
  }

  for (const dev of running) {
    if (namedSerials.has(dev.serial)) continue;
    devices.push({
      name: dev.serial,
      serial: dev.serial,
      profile: "phone",
      state: dev.status === "offline" ? "offline" : "running",
    });
  }

  return devices;
}

export interface BootOptions {
  sdk: string;
  avdName: string;
  emulatorArgs?: string[];
}

const bootedByUs = new Set<string>();

export async function wasBootedByUs(serial: string): Promise<boolean> {
  return bootedByUs.has(serial) || (await isSerialBootedByPorthole(serial));
}

export async function bootDevice(opts: BootOptions): Promise<string> {
  const { sdk, avdName } = opts;
  const emulator = emulatorBin(sdk);

  const args = ["-avd", avdName, ...(opts.emulatorArgs ?? ["-no-snapshot-load"])];
  const child = spawn(emulator, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const serial = await waitForBoot(sdk, avdName);
  bootedByUs.add(serial);
  return serial;
}

async function waitForBoot(
  sdk: string,
  avdName: string,
  timeoutMs = 120_000,
): Promise<string> {
  const start = Date.now();
  const adb = adbBin(sdk);

  while (Date.now() - start < timeoutMs) {
    const devices = await listRunningDevices(sdk);
    for (const dev of devices) {
      if (!dev.serial.startsWith("emulator-")) continue;
      try {
        const { stdout: nameOut } = await execFileAsync(adb, [
          "-s",
          dev.serial,
          "emu",
          "avd",
          "name",
        ]);
        if (nameOut.split("\n")[0]?.trim() === avdName) {
          const { stdout: bootOut } = await execFileAsync(adb, [
            "-s",
            dev.serial,
            "shell",
            "getprop",
            "sys.boot_completed",
          ]);
          if (bootOut.trim() === "1") {
            const { stdout: pmOut } = await execFileAsync(adb, [
              "-s",
              dev.serial,
              "shell",
              "pm",
              "path",
              "android",
            ]);
            if (pmOut.trim()) return dev.serial;
          }
        }
      } catch {
        // not ready yet
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(`Timed out waiting for ${avdName} to boot`);
}

export async function shutdownDevice(sdk: string, serial: string): Promise<void> {
  const adb = adbBin(sdk);
  await execFileAsync(adb, ["-s", serial, "emu", "kill"]);
  bootedByUs.delete(serial);
  await removeSession({ serial });
}

export async function reconnectOfflineDevices(
  sdk: string,
  serial?: string,
  timeoutMs = 10_000,
): Promise<void> {
  const adb = adbBin(sdk);
  await execFileAsync(adb, ["reconnect", "offline"]);
  if (!serial) return;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const devices = await listRunningDevices(sdk);
    if (
      devices.some((device) => device.serial === serial && device.status === "device")
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Device ${serial} is still offline after adb reconnect offline.`);
}
