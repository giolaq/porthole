#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  listDevices,
  findAndroidSdk,
  bootDevice,
  shutdownDevice,
  wasBootedByUs,
  reconnectOfflineDevices,
  type DeviceInfo,
} from "./device-manager.js";
import { REMOTE_BUTTON_TO_KEYCODE, type RemoteButton } from "./keycodes.js";
import { Session } from "./session.js";
import { startMcpServer } from "./mcp/server.js";
import { VERSION } from "./index.js";
import { resolveTarget } from "./target-resolution.js";
import {
  defaultScreenshotPath,
  fetchSessionScreenshot,
  getSessionJson,
  postSessionJson,
  sendSessionInput,
  writeScreenshot,
} from "./control-client.js";
import { readState } from "./state.js";
import { runCliAction } from "./cli-errors.js";
import { runDoctor } from "./doctor.js";
import { ensurePortFree } from "./port-check.js";
import { scrollGesture, type ScrollDirection } from "./gesture.js";

const program = new Command();

if (Number(process.versions.node.split(".")[0] ?? "0") < 20) {
  console.error("porthole: Node.js 20 or newer is required.");
  process.exit(1);
}

program.name("porthole").description("Android emulator preview").version(VERSION);

program
  .command("list", { isDefault: false })
  .description("List AVDs and running emulators")
  .option("-q, --quiet", "JSON output")
  .action(async (opts: { quiet?: boolean }) => {
    const devices = await listDevices();
    const state = await readState();
    if (opts.quiet) {
      process.stdout.write(JSON.stringify({ devices, sessions: state.sessions }) + "\n");
    } else {
      if (devices.length === 0) {
        console.log("No AVDs found.");
      } else {
        for (const d of devices) {
          const status =
            d.state === "running"
              ? `running (${d.serial})`
              : d.state === "offline"
                ? `offline (${d.serial})`
                : "stopped";
          console.log(`  ${d.name}  [${d.profile}]  ${status}`);
        }
      }
      if (state.sessions.length > 0) {
        console.log("\nActive sessions:");
        for (const session of state.sessions) {
          console.log(
            `  ${session.avdName}  ${session.url}  pid=${session.pid} serial=${session.serial}`,
          );
        }
      }
    }
  });

program
  .command("doctor")
  .description("Check local Porthole and Android emulator prerequisites")
  .option("-q, --quiet", "JSON output")
  .action((opts: { quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const checks = await runDoctor();
      if (opts.quiet) {
        process.stdout.write(JSON.stringify({ checks }) + "\n");
        return;
      }
      for (const check of checks) {
        const mark = check.ok ? "OK" : "FAIL";
        console.log(`${mark} ${check.name}: ${check.detail}`);
        if (!check.ok && check.fix) console.log(`  fix: ${check.fix}`);
      }
      if (checks.some((check) => !check.ok)) process.exit(1);
    });
  });

program
  .command("start [avd]", { isDefault: true })
  .description("Boot/attach emulator and serve preview")
  .option("-p, --port <port>", "HTTP port", "3200")
  .option("-d, --device <serial>", "Target device serial")
  .option("--host <host>", "Bind address", "127.0.0.1")
  .option("--no-preview", "Don't open browser")
  .option("--mjpeg", "MJPEG mode")
  .option("--detach", "Run the preview server in the background")
  .option("--keep-alive", "Leave a Porthole-booted emulator running on exit")
  .option("--wipe-data", "Wipe emulator data before boot")
  .option("--no-snapshot", "Disable loading/saving emulator snapshots")
  .option("--cold-boot", "Alias for --no-snapshot")
  .option("--gpu <mode>", "Pass emulator GPU mode")
  .option("--max-size <px>", "Maximum stream dimension", "1280")
  .option("--max-fps <fps>", "Maximum stream FPS", "30")
  .option("--bitrate <bps>", "Stream bitrate in bits per second")
  .option("-q, --quiet", "Quiet/JSON mode")
  .action(
    async (
      avd: string | undefined,
      opts: {
        port: string;
        device?: string;
        host: string;
        preview: boolean;
        mjpeg?: boolean;
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
      },
    ) => {
      // Check the port before prompting, booting, or detaching — a busy port
      // otherwise surfaces as a boot wasted on a doomed session or as an
      // opaque detach timeout.
      const portError = await ensurePortFree(parseInt(opts.port, 10), opts.host);
      if (portError) {
        console.error(portError);
        process.exit(1);
      }

      if (opts.detach && process.env["PORTHOLE_DETACHED_CHILD"] !== "1") {
        await startDetached(avd, opts);
        return;
      }

      const sdk = findAndroidSdk();
      let devices = await listDevices();
      let selectedAvd = avd;
      if (!selectedAvd && !opts.device && !opts.quiet) {
        selectedAvd = await promptForAvd(devices);
      }

      const resolution = resolveTarget(devices, selectedAvd, opts.device);
      let target: DeviceInfo | undefined;
      let bootedByUs = false;

      if (resolution.action === "error") {
        console.error(resolution.message);
        process.exit(1);
      }

      if (resolution.action === "boot") {
        if (!opts.quiet) console.log(`Booting ${resolution.avdName}...`);
        const serial = await bootDevice({
          sdk,
          avdName: resolution.avdName,
          emulatorArgs: emulatorArgs(opts),
        });
        devices = await listDevices();
        target = devices.find((d) => d.serial === serial);
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
        if (reconnected) {
          target = reconnected;
        }
      }

      if (!target || !target.serial || target.state !== "running") {
        console.error("No target device.");
        process.exit(1);
      }

      const session = new Session({
        device: target,
        port: parseInt(opts.port, 10),
        host: opts.host,
        maxSize: Number(opts.maxSize),
        maxFps: Number(opts.maxFps),
        bitrate: opts.bitrate ? Number(opts.bitrate) : undefined,
        bootedByUs,
        detached: process.env["PORTHOLE_DETACHED_CHILD"] === "1",
        forceMjpeg: opts.mjpeg ?? false,
      });

      try {
        const { url } = await session.start();
        if (!opts.quiet) {
          console.log(
            `Attached to ${target.name} [${target.profile}] (${target.serial})`,
          );
          console.log(`Preview: ${url}`);
          if (opts.mjpeg) console.log("Video mode: MJPEG screenshot polling");
        } else {
          process.stdout.write(JSON.stringify({ device: target, url }) + "\n");
        }
        if (opts.preview && process.env["PORTHOLE_DETACHED_CHILD"] !== "1") {
          openBrowser(url);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("EADDRINUSE")) {
          console.error(
            `Port ${opts.port} is already in use. Try another port with -p ${Number(opts.port) + 1}.`,
          );
        } else {
          console.error(`Failed to start: ${message}`);
        }
        if (bootedByUs && !opts.keepAlive && target.serial) {
          await shutdownDevice(sdk, target.serial);
        }
        process.exit(1);
      }

      const stopForSignal = async () => {
        await session.stop();
        if (bootedByUs && !opts.keepAlive && target.serial) {
          await shutdownDevice(sdk, target.serial);
        }
        process.exit(0);
      };
      process.on("SIGINT", () => void stopForSignal());
      process.on("SIGTERM", () => void stopForSignal());
    },
  );

program
  .command("kill [avd]")
  .description("Stop emulator(s) Porthole started")
  .option("-q, --quiet", "JSON output")
  .action(async (avd: string | undefined, opts: { quiet?: boolean }) => {
    const sdk = findAndroidSdk();
    const devices = await listDevices();
    const state = await readState();
    const targetSerials = new Set<string>();
    for (const d of devices) {
      if (
        d.state === "running" &&
        d.serial &&
        (avd ? d.name === avd : await wasBootedByUs(d.serial))
      ) {
        targetSerials.add(d.serial);
      }
    }
    for (const session of state.sessions) {
      if (!avd || session.avdName === avd) {
        targetSerials.add(session.serial);
        if (session.detached && session.pid !== process.pid) {
          try {
            process.kill(session.pid, "SIGTERM");
          } catch {
            // process already gone
          }
        }
      }
    }

    if (targetSerials.size === 0) {
      if (opts.quiet) {
        process.stdout.write(JSON.stringify({ killed: [] }) + "\n");
      } else {
        console.log("No emulators to kill.");
      }
      return;
    }

    const killed: string[] = [];
    for (const serial of targetSerials) {
      if (!opts.quiet) {
        console.log(`Shutting down ${serial}...`);
      }
      await shutdownDevice(sdk, serial);
      killed.push(serial);
    }
    if (opts.quiet) {
      process.stdout.write(JSON.stringify({ killed }) + "\n");
    }
  });

program
  .command("tap <x> <y>")
  .description("Touch at normalized 0..1 coordinates")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((x: string, y: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const nx = parseFloat(x);
      const ny = parseFloat(y);
      if (isNaN(nx) || isNaN(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        throw new Error("Coordinates must be numbers in 0..1");
      }
      await sendSessionInput(
        { kind: "touch", phase: "down", x: nx, y: ny },
        { port: parseOptionalPort(opts.port) },
      );
      const session = await sendSessionInput(
        { kind: "touch", phase: "up", x: nx, y: ny },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, session, event: "tap" }, `Tapped ${nx},${ny}`);
    });
  });

program
  .command("swipe <x1> <y1> <x2> <y2>")
  .description("Swipe between normalized 0..1 phone coordinates")
  .option("--duration <ms>", "Gesture duration in milliseconds")
  .option("--steps <count>", "Number of move events")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action(
    (
      x1: string,
      y1: string,
      x2: string,
      y2: string,
      opts: { duration?: string; steps?: string; port?: string; quiet?: boolean },
    ) => {
      void runCliAction(opts, async () => {
        const event = {
          kind: "gesture" as const,
          type: "swipe" as const,
          x1: parseNormalized(x1, "x1"),
          y1: parseNormalized(y1, "y1"),
          x2: parseNormalized(x2, "x2"),
          y2: parseNormalized(y2, "y2"),
          ...(opts.duration === undefined
            ? {}
            : { durationMs: parsePositiveNumber(opts.duration, "duration") }),
          ...(opts.steps === undefined
            ? {}
            : { steps: parsePositiveInteger(opts.steps, "steps") }),
        };
        const session = await sendSessionInput(event, {
          port: parseOptionalPort(opts.port),
        });
        printResult(opts.quiet, { ok: true, session, event }, "Swiped");
      });
    },
  );

program
  .command("longpress <x> <y>")
  .alias("long-press")
  .description("Long-press normalized 0..1 phone coordinates")
  .option("--duration <ms>", "Hold duration in milliseconds")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action(
    (
      x: string,
      y: string,
      opts: { duration?: string; port?: string; quiet?: boolean },
    ) => {
      void runCliAction(opts, async () => {
        const event = {
          kind: "gesture" as const,
          type: "longpress" as const,
          x1: parseNormalized(x, "x"),
          y1: parseNormalized(y, "y"),
          ...(opts.duration === undefined
            ? {}
            : { durationMs: parsePositiveNumber(opts.duration, "duration") }),
        };
        const session = await sendSessionInput(event, {
          port: parseOptionalPort(opts.port),
        });
        printResult(opts.quiet, { ok: true, session, event }, "Long-pressed");
      });
    },
  );

program
  .command("scroll <direction>")
  .description("Scroll a phone screen: up, down, left, or right")
  .option("--amount <value>", "Normalized scroll amount", "0.5")
  .option("--duration <ms>", "Gesture duration in milliseconds")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action(
    (
      direction: string,
      opts: { amount: string; duration?: string; port?: string; quiet?: boolean },
    ) => {
      void runCliAction(opts, async () => {
        if (!isScrollDirection(direction)) {
          throw new Error("Scroll direction must be up, down, left, or right");
        }
        const event = scrollGesture(
          direction,
          parseNormalized(opts.amount, "amount"),
          opts.duration === undefined
            ? undefined
            : parsePositiveNumber(opts.duration, "duration"),
        );
        const session = await sendSessionInput(event, {
          port: parseOptionalPort(opts.port),
        });
        printResult(
          opts.quiet,
          { ok: true, session, direction, event },
          `Scrolled ${direction}`,
        );
      });
    },
  );

program
  .command("key <keycode>")
  .description("Send a single Android keyevent")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((keycode: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const code = parseInt(keycode, 10);
      if (isNaN(code)) {
        throw new Error("Keycode must be a number");
      }
      await sendSessionInput(
        { kind: "key", phase: "down", keycode: code },
        { port: parseOptionalPort(opts.port) },
      );
      const session = await sendSessionInput(
        { kind: "key", phase: "up", keycode: code },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, session, keycode: code }, `Key ${code} sent`);
    });
  });

program
  .command("remote <button>")
  .description("D-pad / media remote button")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((button: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      if (!(button in REMOTE_BUTTON_TO_KEYCODE)) {
        throw new Error(
          `Unknown button: ${button}. Valid: ${Object.keys(REMOTE_BUTTON_TO_KEYCODE).join(", ")}`,
        );
      }
      const session = await sendSessionInput(
        { kind: "remote", button: button as RemoteButton },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, session, button }, `Remote: ${button}`);
    });
  });

program
  .command("text <string>")
  .description("Type text")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((text: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const session = await sendSessionInput(
        { kind: "text", text },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, session, text }, `Typed "${text}"`);
    });
  });

program
  .command("screenshot")
  .description("Take a PNG screenshot from a running session")
  .option("-p, --port <port>", "Session port")
  .option("-o, --output <file>", "Output path")
  .option("-q, --quiet", "JSON output")
  .action((opts: { port?: string; output?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const { session, png } = await fetchSessionScreenshot({
        port: parseOptionalPort(opts.port),
      });
      const output = opts.output ?? defaultScreenshotPath(session.serial);
      await writeScreenshot(output, png);
      printResult(opts.quiet, { ok: true, path: output, session }, output);
    });
  });

program
  .command("rotate <orientation>")
  .description("Rotate a phone session: portrait, landscape, left, or right")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((orientation: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await postSessionJson(
        "/api/rotate",
        { orientation },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, ...result }, `Rotated ${orientation}`);
    });
  });

program
  .command("emu <args...>")
  .description("Pass arguments to adb emu for the active session")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((args: string[], opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await postSessionJson(
        "/api/emu",
        { args },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, ...result }, "Emulator command sent");
    });
  });

program
  .command("focused")
  .description("Print the currently focused UI node")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await getSessionJson("/api/focused", {
        port: parseOptionalPort(opts.port),
      });
      printResult(opts.quiet, result, JSON.stringify(result.response, null, 2));
    });
  });

program
  .command("dump-ui")
  .description("Dump the Android accessibility hierarchy")
  .option("-p, --port <port>", "Session port")
  .option("--filter <text>", "Filter by text/resource id/content description")
  .option("-q, --quiet", "JSON output")
  .action((opts: { port?: string; filter?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const query = opts.filter
        ? `?${new URLSearchParams({ filter: opts.filter }).toString()}`
        : "";
      const result = await getSessionJson(`/api/ui${query}`, {
        port: parseOptionalPort(opts.port),
      });
      printResult(opts.quiet, result, JSON.stringify(result.response, null, 2));
    });
  });

program
  .command("wait-for <text>")
  .description("Wait until text appears in the UI hierarchy")
  .option("-p, --port <port>", "Session port")
  .option("--timeout <ms>", "Timeout in milliseconds", "10000")
  .option("-q, --quiet", "JSON output")
  .action((text: string, opts: { port?: string; timeout: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await postSessionJson(
        "/api/wait_for",
        { text, timeoutMs: Number(opts.timeout) },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, ...result }, `Found "${text}"`);
    });
  });

program
  .command("open-url <url>")
  .description("Open an Android deep link or URL")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((url: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await postSessionJson(
        "/api/open_url",
        { url },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, ...result }, `Opened ${url}`);
    });
  });

program
  .command("stop-app <package>")
  .description("Force-stop an app package")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((packageName: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await postSessionJson(
        "/api/stop_app",
        { packageName },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, ...result }, `Stopped ${packageName}`);
    });
  });

program
  .command("clear-app <package>")
  .description("Clear an app package's data")
  .option("-p, --port <port>", "Session port")
  .option("-q, --quiet", "JSON output")
  .action((packageName: string, opts: { port?: string; quiet?: boolean }) => {
    void runCliAction(opts, async () => {
      const result = await postSessionJson(
        "/api/clear_app",
        { packageName },
        { port: parseOptionalPort(opts.port) },
      );
      printResult(opts.quiet, { ok: true, ...result }, `Cleared ${packageName}`);
    });
  });

program
  .command("mcp")
  .description("Run the MCP server on stdio")
  .action(async () => {
    await startMcpServer();
  });

program.parse();

interface StartOptions {
  port: string;
  device?: string;
  host: string;
  preview: boolean;
  mjpeg?: boolean;
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

async function startDetached(avd: string | undefined, opts: StartOptions): Promise<void> {
  const cliPath = fileURLToPath(import.meta.url);
  const args = [cliPath, "start"];
  if (avd) args.push(avd);
  args.push("--port", opts.port, "--host", opts.host, "--no-preview");
  if (opts.device) args.push("--device", opts.device);
  if (opts.mjpeg) args.push("--mjpeg");
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
  let session;
  while (Date.now() < deadline) {
    const state = await readState();
    session = state.sessions.find(
      (record) => record.port === port && record.pid === child.pid,
    );
    if (session) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!session) {
    console.error("Detached server did not become ready before the timeout.");
    process.exit(1);
  }

  if (opts.quiet) {
    process.stdout.write(JSON.stringify(session) + "\n");
  } else {
    console.log(`Detached Porthole server pid=${session.pid}`);
    console.log(`Preview: ${session.url}`);
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

async function promptForAvd(
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

function openBrowser(url: string): void {
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

function parseOptionalPort(port: string | undefined): number | undefined {
  return port === undefined ? undefined : parsePort(port);
}

function parsePort(port: string): number {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return parsed;
}

function parseNormalized(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be a number in 0..1`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function isScrollDirection(value: string): value is ScrollDirection {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

function printResult(quiet: boolean | undefined, json: unknown, text: string): void {
  if (quiet) {
    process.stdout.write(JSON.stringify(json) + "\n");
  } else {
    console.log(text);
  }
}
