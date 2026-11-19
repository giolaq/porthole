import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { isPortFree } from "./port-check.js";

const execFileAsync = promisify(execFile);

async function isEmulatorConsoleUp(port = 5554): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(port, "127.0.0.1");
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
    socket.once("data", (chunk) => {
      const isEmulatorConsole = chunk.toString().includes("Android Console");
      socket.destroy();
      resolve(isEmulatorConsole);
    });
  });
}

// Ask the version manager instead of guessing its component/version directory
// layout. In SDK 0.24, SDKs can live under sdk/vega-sdk/<channel>/<version>.
export async function resolveVdaBin(): Promise<string | null> {
  const override = process.env["PORTHOLE_VDA_BIN"];
  if (override) {
    if (!existsSync(override)) throw new Error(`PORTHOLE_VDA_BIN not found: ${override}`);
    return override;
  }
  const cli = resolveVegaCli();
  if (!cli) return null;
  const { stdout } = await execFileAsync(cli, ["which", "vda"], { timeout: 15_000 });
  const candidate = stdout.trim();
  if (!existsSync(candidate))
    throw new Error(`vega which vda returned an invalid path: ${candidate}`);
  return candidate;
}

export function resolveVegaCli(): string | null {
  const override = process.env["PORTHOLE_VEGA_BIN"];
  if (override) {
    if (!existsSync(override))
      throw new Error(`PORTHOLE_VEGA_BIN not found: ${override}`);
    return override;
  }
  // Prefer the user's active launcher, including custom SDK installations.
  for (const dir of (process.env["PATH"] ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, "vega");
    if (existsSync(candidate)) return candidate;
  }
  const launcher = join(homedir(), "vega", "bin", "vega");
  if (existsSync(launcher)) return launcher;
  // Legacy installations predate the version manager.
  const sdkRoot = join(homedir(), "vega", "sdk");
  if (!existsSync(sdkRoot)) return null;
  const versions = readdirSync(sdkRoot).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  );
  for (const version of versions) {
    const candidate = join(sdkRoot, version, "bin", "vega");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function isVegaConsoleUp(port = 5554): Promise<boolean> {
  const cli = resolveVegaCli();
  if (!cli) return false;
  const { stdout } = await execFileAsync(cli, ["virtual-device", "status"], {
    timeout: 15_000,
  });
  const status = JSON.parse(stdout.trim()) as { running?: boolean };
  // Both Android and Vega emit "Android Console". Only the SDK can identify
  // its own running VVD; the console greeting alone is not sufficient.
  return status.running === true && (await isEmulatorConsoleUp(port));
}

export async function ensureVegaVirtualDevice(): Promise<void> {
  const cli = resolveVegaCli();
  if (!cli) {
    throw new Error("Vega CLI not found. Install the Vega SDK or set PORTHOLE_VEGA_BIN.");
  }
  if (await isVegaConsoleUp()) return;
  for (const port of [5554, 5555]) {
    if (!(await isPortFree(port, "127.0.0.1"))) {
      throw new Error(
        `Vega requires port ${port}, but it is occupied by another process. Stop the Android emulator or other process using that port, then retry.`,
      );
    }
  }
  await execFileAsync(cli, ["virtual-device", "start", "--no-gui", "--timeout", "240"], {
    timeout: 300_000,
  });
  if (!(await isVegaConsoleUp())) {
    throw new Error(
      "Vega reported ready but its virtual device is not running. Check `vega virtual-device status` and the SDK logs.",
    );
  }
}
