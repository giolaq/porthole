import { Command } from "commander";
import {
  listDevices,
  findAndroidSdk,
  shutdownDevice,
  wasBootedByUs,
} from "../device-manager.js";
import { Session, type SessionDeviceOptions } from "../session.js";
import { startMcpServer } from "../mcp/server.js";
import { VERSION } from "../index.js";
import { readState, removeSession } from "../state.js";
import { runCliAction } from "../cli-errors.js";
import { runDoctor } from "../doctor.js";
import { ensurePortFree } from "../port-check.js";
import { isFirstRun, markWelcomeShown, welcomeText } from "../first-run.js";
import {
  resolveSessionTargets,
  promptForAvd,
  openBrowser,
  startVegaSession,
  startDetachedSession,
} from "./start-flow.js";
export function register(program: Command): void {
  program
    .command("list", { isDefault: false })
    .description("List AVDs and running emulators")
    .option("-q, --quiet", "JSON output")
    .action(async (opts: { quiet?: boolean }) => {
      const devices = await listDevices();
      const state = await readState();
      if (opts.quiet) {
        process.stdout.write(
          JSON.stringify({ devices, sessions: state.sessions }) + "\n",
        );
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
    .command("start [avds...]", { isDefault: true })
    .description("Boot/attach emulator and serve preview")
    .option("-p, --port <port>", "HTTP port", "3200")
    .option("-d, --device <serial>", "Target device serial")
    .option("--host <host>", "Bind address", "127.0.0.1")
    .option("--no-preview", "Don't open browser")
    .option("--mjpeg", "MJPEG mode")
    .option("--vega", "Attach to the Amazon Vega (Fire TV) virtual device")
    .option("--detach", "Run the preview server in the background")
    .option("--keep-alive", "Leave the emulator running on exit")
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
        avds: string[] | undefined,
        opts: {
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
        },
      ) => {
        if (
          !opts.quiet &&
          process.env["PORTHOLE_DETACHED_CHILD"] !== "1" &&
          (await isFirstRun())
        ) {
          console.log(welcomeText(VERSION));
          await markWelcomeShown();
        }

        // Check the port before prompting, booting, or detaching — a busy port
        // otherwise surfaces as a boot wasted on a doomed session or as an
        // opaque detach timeout.
        const portError = await ensurePortFree(parseInt(opts.port, 10), opts.host);
        if (portError) {
          console.error(portError);
          process.exit(1);
        }

        if (opts.detach && process.env["PORTHOLE_DETACHED_CHILD"] !== "1") {
          await startDetachedSession(avds ?? [], opts);
          return;
        }

        if (opts.vega) {
          await startVegaSession(opts);
          return;
        }

        const sdk = findAndroidSdk();
        const devices = await listDevices();
        let selectedAvds = avds ?? [];
        if (selectedAvds.length === 0 && !opts.device && !opts.quiet) {
          const selectedAvd = await promptForAvd(devices);
          selectedAvds = selectedAvd ? [selectedAvd] : [];
        }

        let targets: SessionDeviceOptions[];
        try {
          targets = await resolveSessionTargets(devices, selectedAvds, opts, sdk);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }

        const session = new Session({
          devices: targets,
          port: parseInt(opts.port, 10),
          host: opts.host,
          maxSize: Number(opts.maxSize),
          maxFps: Number(opts.maxFps),
          bitrate: opts.bitrate ? Number(opts.bitrate) : undefined,
          detached: process.env["PORTHOLE_DETACHED_CHILD"] === "1",
          forceMjpeg: opts.mjpeg ?? false,
        });

        try {
          const { url } = await session.start();
          if (!opts.quiet) {
            for (const target of targets) {
              console.log(
                `Attached to ${target.device.name} [${target.device.profile}] (${target.device.serial})`,
              );
            }
            console.log(`Preview: ${url}`);
            if (opts.mjpeg) console.log("Video mode: MJPEG screenshot polling");
          } else {
            process.stdout.write(
              JSON.stringify({ devices: targets.map((target) => target.device), url }) +
                "\n",
            );
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
          for (const target of targets) {
            if (target.bootedByUs && !opts.keepAlive && target.device.serial) {
              await shutdownDevice(sdk, target.device.serial);
            }
          }
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
          for (const target of targets) {
            if (!opts.keepAlive && target.device.serial) {
              if (!opts.quiet) console.log(`Stopping ${target.device.name}...`);
              await shutdownDevice(sdk, target.device.serial);
            }
          }
          if (!opts.quiet) console.log("Porthole closed. See you next time! 👋");
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
      const matchedSessions = state.sessions.filter(
        (session) => !avd || session.avdName === avd,
      );
      for (const d of devices) {
        if (
          d.state === "running" &&
          d.serial &&
          (avd ? d.name === avd : await wasBootedByUs(d.serial))
        ) {
          targetSerials.add(d.serial);
        }
      }
      for (const session of matchedSessions) {
        targetSerials.add(session.serial);
        if (session.detached && session.pid !== process.pid) {
          const siblingOnSharedServer =
            avd !== undefined &&
            state.sessions.some(
              (other) =>
                other.pid === session.pid &&
                other.port === session.port &&
                other.serial !== session.serial,
            );
          if (!siblingOnSharedServer) {
            try {
              process.kill(session.pid, "SIGTERM");
            } catch {
              // process already gone
            }
          } else {
            await removeSession({ serial: session.serial });
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
    .command("mcp")
    .description("Run the MCP server on stdio")
    .action(async () => {
      await startMcpServer();
    });
}
