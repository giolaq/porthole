import { access } from "node:fs/promises";
import { createServer } from "node:net";
import {
  adbBin,
  emulatorBin,
  findAndroidSdk,
  listAvds,
  listRunningDevices,
} from "./device-manager.js";
import { readState, removeSession, statePath } from "./state.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export async function runDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push({
    name: "node",
    ok: Number(process.versions.node.split(".")[0] ?? "0") >= 20,
    detail: `Node ${process.versions.node}`,
    fix: "Install Node.js 20 or newer.",
  });

  let sdk: string | null = null;
  try {
    sdk = findAndroidSdk();
    checks.push({
      name: "sdk",
      ok: true,
      detail: `Android SDK: ${sdk}`,
    });
  } catch (error) {
    checks.push({
      name: "sdk",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      fix: "Set ANDROID_HOME or ANDROID_SDK_ROOT.",
    });
  }

  if (sdk) {
    checks.push(
      await fileCheck("adb", adbBin(sdk), "Install Android SDK platform-tools."),
    );
    checks.push(
      await fileCheck("emulator", emulatorBin(sdk), "Install Android Emulator."),
    );
    try {
      const running = await listRunningDevices(sdk);
      checks.push({
        name: "adb-server",
        ok: true,
        detail: `${running.length} emulator transport(s) visible`,
      });
      checks.push({
        name: "offline-devices",
        ok: !running.some((device) => device.status === "offline"),
        detail:
          running.filter((device) => device.status === "offline").length === 0
            ? "No offline transports"
            : "At least one transport is offline",
        fix: "Run `adb reconnect offline` or restart the emulator.",
      });
    } catch (error) {
      checks.push({
        name: "adb-server",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        fix: "Start or reinstall adb platform-tools.",
      });
    }

    const avds = await listAvds(sdk);
    checks.push({
      name: "avds",
      ok: avds.length > 0,
      detail: `${avds.length} AVD(s) defined`,
      fix: "Create an Android Virtual Device in Android Studio.",
    });
  }

  checks.push({
    name: "port-3200",
    ok: await isPortFree(3200),
    detail: (await isPortFree(3200)) ? "Port 3200 is free" : "Port 3200 is in use",
    fix: "Use `porthole start -p 3201`.",
  });

  const state = await readState();
  let stale = 0;
  for (const session of state.sessions) {
    if (!isPidAlive(session.pid)) {
      stale++;
      await removeSession({ pid: session.pid });
    }
  }
  checks.push({
    name: "state",
    ok: true,
    detail: `${statePath()} (${stale} stale session(s) pruned)`,
  });

  return checks;
}

async function fileCheck(name: string, path: string, fix: string): Promise<DoctorCheck> {
  try {
    await access(path);
    return { name, ok: true, detail: path };
  } catch {
    return { name, ok: false, detail: `${path} not found`, fix };
  }
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
