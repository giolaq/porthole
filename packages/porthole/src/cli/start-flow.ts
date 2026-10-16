import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  listDevices,
  bootDevice,
  reconnectOfflineDevices,
  type DeviceInfo,
} from "../device-manager.js";
import { Session, type SessionDeviceOptions } from "../session.js";
import { resolveTarget } from "../target-resolution.js";
import { readState } from "../state.js";
import { ensureVegaVirtualDevice } from "../engine/vega-engine.js";
import { parsePort } from "./shared.js";

export interface StartOptions {
  port: string;
  device?: string;
  host: string;
  preview: boolean;
  mjpeg?: boolean;
  vega?: boolean;
  detach?: boolean;
  keepAlive?: boolean;
  wipeData?: boolean;
  snapshot?: boolean;
  coldBoot?: boolean;
  gpu?: string;
  maxSize: string;
  maxFps: string;
  bitrate?: string;
  quiet?: boolean;
}

export async function resolveSessionTargets(
  initialDevices: DeviceInfo[],
  avds: string[],
  opts: StartOptions,
  sdk: string,
): Promise<SessionDeviceOptions[]> {
  let devices = initialDevices;
  const serials = parseSerialList(opts.device);
  if (serials.length > 0) {
    const targets: SessionDeviceOptions[] = [];
    for (const serial of serials) {
      let target = devices.find((device) => device.serial === serial);
      if (target?.state === "offline") {
        if (!opts.quiet) console.log(`Reconnecting ${target.serial}...`);
        await reconnectOfflineDevices(sdk, target.serial ?? undefined);
        devices = await listDevices();
        target = devices.find((device) => device.serial === serial);
      }
      if (!target || !target.serial || target.state !== "running") {
        throw new Error(`No running target device for serial ${serial}.`);
      }
      targets.push({ device: target, bootedByUs: false });
    }
    return targets;
  }

  const requested = avds.length > 0 ? avds : [undefined];
  const targets: SessionDeviceOptions[] = [];
  for (const avd of requested) {
    const resolution = resolveTarget(devices, avd, undefined);
    let target: DeviceInfo | undefined;
    let bootedByUs = false;

    if (resolution.action === "error") {
      throw new Error(resolution.message);
    }

    if (resolution.action === "boot") {
      if (!opts.quiet) console.log(`Booting ${resolution.avdName}...`);
      const serial = await bootDevice({
        sdk,
        avdName: resolution.avdName,
        emulatorArgs: emulatorArgs(opts),
      });
      devices = await listDevices();
      target = devices.find((device) => device.serial === serial);
      bootedByUs = true;
    } else {
      target = resolution.device;
    }

    if (target?.state === "offline") {
      if (!opts.quiet) console.log(`Reconnecting ${target.serial}...`);
      await reconnectOfflineDevices(sdk, target.serial ?? undefined);
      devices = await listDevices();
      const reconnected = devices.find(
        (device) =>
          (target?.serial && device.serial === target.serial) ||
          device.name === target?.name,
      );
      if (reconnected) target = reconnected;
    }

    if (!target || !target.serial || target.state !== "running") {
      throw new Error("No target device.");
    }

    if (!targets.some((entry) => entry.device.serial === target?.serial)) {
      targets.push({ device: target, bootedByUs });
    }
  }
  return targets;
}

export function parseSerialList(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((serial) => serial.trim())
        .filter(Boolean)
    : [];
}

export async function startVegaSession(opts: StartOptions): Promise<void> {
  // The Vega engine talks to sockets that vanish whenever the VVD restarts;
  // a stray rejection must degrade the stream, not kill the server. Keep a
  // trail for diagnosis (the spike had silent daemon deaths).
  const crashLog = join(tmpdir(), "porthole", "vega-server-errors.log");
  const logSurvivableError = (kind: string, error: unknown) => {
    const line = `${new Date().toISOString()} ${kind}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`;
    void appendFile(crashLog, line).catch(() => undefined);
    console.error(`porthole(vega): survived ${kind}: ${String(error).slice(0, 200)}`);
  };
  process.on("uncaughtException", (error) =>
    logSurvivableError("uncaughtException", error),
  );
  process.on("unhandledRejection", (error) =>
    logSurvivableError("unhandledRejection", error),
  );

  if (!opts.quiet) console.log("Checking the Vega Virtual Device...");
  await ensureVegaVirtualDevice();

  const device: DeviceInfo = {
    name: "Vega_Virtual_Device",
    serial: "emulator-5554",
    profile: "tv",
    state: "running",
  };

  const session = new Session({
    device,
    port: parseInt(opts.port, 10),
    host: opts.host,
    detached: process.env["PORTHOLE_DETACHED_CHILD"] === "1",
    // No H.264 stream on Vega — the browser renders the MJPEG poller feed.
    forceMjpeg: true,
    engineKind: "vega",
  });

  try {
    const { url } = await session.start();
    if (!opts.quiet) {
      console.log(`Attached to ${device.name} [tv] (${device.serial}, Vega)`);
      console.log(`Preview: ${url}`);
      console.log("Video mode: MJPEG screenshot polling (Vega has no H.264 stream)");
    } else {
      process.stdout.write(JSON.stringify({ device, url }) + "\n");
    }
    if (opts.preview && process.env["PORTHOLE_DETACHED_CHILD"] !== "1") {
      openBrowser(url);
    }
  } catch (e) {
    console.error(`Failed to start: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  let stopping = false;
  const stopForSignal = async () => {
    if (stopping) process.exit(130);
    stopping = true;
    if (!opts.quiet) {
      console.log("\nShutting down (press Ctrl+C again to force quit)...");
    }
    await session.stop();
    if (!opts.quiet) console.log("Porthole closed. See you next time! 👋");
    process.exit(0);
  };
  process.on("SIGINT", () => void stopForSignal());
  process.on("SIGTERM", () => void stopForSignal());
}

export async function startDetachedSession(
  avds: string[],
  opts: StartOptions,
): Promise<void> {
  const cliPath = fileURLToPath(new URL("../cli.js", import.meta.url));
  const args = [cliPath, "start"];
  args.push(...avds);
  args.push("--port", opts.port, "--host", opts.host, "--no-preview");
  if (opts.device) args.push("--device", opts.device);
  if (opts.mjpeg) args.push("--mjpeg");
  if (opts.vega) args.push("--vega");
  if (opts.keepAlive) args.push("--keep-alive");
  if (opts.wipeData) args.push("--wipe-data");
  if (opts.snapshot === false || opts.coldBoot) args.push("--no-snapshot");
  if (opts.gpu) args.push("--gpu", opts.gpu);
  args.push("--max-size", opts.maxSize, "--max-fps", opts.maxFps);
  if (opts.bitrate) args.push("--bitrate", opts.bitrate);
  if (opts.quiet) args.push("--quiet");

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORTHOLE_DETACHED_CHILD: "1" },
  });
  child.unref();

  const port = parsePort(opts.port);
  const deadline = Date.now() + 120_000;
  let sessions: Awaited<ReturnType<typeof readState>>["sessions"] = [];
  const expectedSessions = Math.max(1, avds.length, parseSerialList(opts.device).length);
  while (Date.now() < deadline) {
    const state = await readState();
    sessions = state.sessions.filter(
      (record) => record.port === port && record.pid === child.pid,
    );
    if (sessions.length >= expectedSessions) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (sessions.length === 0) {
    console.error("Detached server did not become ready before the timeout.");
    process.exit(1);
  }

  if (opts.quiet) {
    process.stdout.write(
      JSON.stringify(sessions.length === 1 ? sessions[0] : { sessions }) + "\n",
    );
  } else {
    console.log(`Detached Porthole server pid=${sessions[0]?.pid}`);
    console.log(`Preview: ${sessions[0]?.url}`);
  }
}

function emulatorArgs(opts: StartOptions): string[] {
  const args: string[] = [];
  if (opts.wipeData) args.push("-wipe-data");
  if (opts.snapshot === false || opts.coldBoot) {
    args.push("-no-snapshot-load", "-no-snapshot-save");
  } else {
    args.push("-no-snapshot-load");
  }
  if (opts.gpu) args.push("-gpu", opts.gpu);
  return args;
}

export async function promptForAvd(
  devices: Awaited<ReturnType<typeof listDevices>>,
): Promise<string | undefined> {
  const stopped = devices.filter((device) => device.state === "stopped");
  if (stopped.length === 0) return undefined;
  console.log("Choose an AVD to boot:");
  stopped.forEach((device, index) => {
    console.log(`  ${index + 1}. ${device.name} [${device.profile}]`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("AVD number: ");
    const index = Number(answer) - 1;
    return stopped[index]?.name;
  } finally {
    rl.close();
  }
}

export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  if (process.platform !== "win32" && !existsSync(`/usr/bin/${command}`)) {
    return;
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}
