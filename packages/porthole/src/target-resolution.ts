import type { DeviceInfo } from "./device-manager.js";

export type TargetResolution =
  | { action: "attach"; device: DeviceInfo }
  | { action: "boot"; avdName: string; profile: DeviceInfo["profile"] }
  | { action: "error"; message: string };

export function resolveTarget(
  devices: DeviceInfo[],
  avd?: string,
  serial?: string,
): TargetResolution {
  if (serial) {
    const bySerial = devices.find((device) => device.serial === serial);
    if (!bySerial) {
      return { action: "error", message: `No running emulator with serial ${serial}.` };
    }
    if (bySerial.state === "stopped") {
      return { action: "error", message: `Device ${serial} is not running.` };
    }
    return { action: "attach", device: bySerial };
  }

  if (avd) {
    const named = devices.find((device) => device.name === avd);
    if (!named) {
      return { action: "error", message: `AVD "${avd}" not found.` };
    }
    if (named.state === "running" || named.state === "offline") {
      return { action: "attach", device: named };
    }
    return { action: "boot", avdName: named.name, profile: named.profile };
  }

  const running = devices.filter((device) => device.state === "running");
  if (running.length === 1) {
    return { action: "attach", device: running[0] };
  }
  if (running.length === 0) {
    return {
      action: "error",
      message: "No running emulator. Specify an AVD name to boot.",
    };
  }
  return {
    action: "error",
    message: "Multiple emulators running. Specify --device or an AVD name.",
  };
}
