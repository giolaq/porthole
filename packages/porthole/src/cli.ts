#!/usr/bin/env node
import { Command } from "commander";
import {
  listDevices,
  findAndroidSdk,
  bootDevice,
  shutdownDevice,
  wasBootedByUs,
} from "./device-manager.js";
import { REMOTE_BUTTON_TO_KEYCODE } from "./keycodes.js";
import { Session } from "./session.js";
import { startMcpServer } from "./mcp/server.js";
import { VERSION } from "./index.js";

const program = new Command();

program.name("porthole").description("Android emulator preview").version(VERSION);

program
  .command("list", { isDefault: false })
  .description("List AVDs and running emulators")
  .option("-q, --quiet", "JSON output")
  .action(async (opts: { quiet?: boolean }) => {
    const devices = await listDevices();
    if (opts.quiet) {
      process.stdout.write(JSON.stringify(devices, null, 2) + "\n");
    } else {
      if (devices.length === 0) {
        console.log("No AVDs found.");
        return;
      }
      for (const d of devices) {
        const status = d.state === "running" ? `running (${d.serial})` : "stopped";
        console.log(`  ${d.name}  [${d.profile}]  ${status}`);
      }
    }
  });

program
  .command("start [avd]", { isDefault: true })
  .description("Boot/attach emulator and serve preview")
  .option("-p, --port <port>", "HTTP port", "3200")
  .option("-d, --device <serial>", "Target device serial")
  .option("--host <host>", "Bind address", "127.0.0.1")
  .option("--no-preview", "Don't open browser")
  .option("--mjpeg", "MJPEG mode")
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
        quiet?: boolean;
      },
    ) => {
      const sdk = findAndroidSdk();
      let devices = await listDevices();

      let target = devices.find((d) => d.name === avd || d.serial === opts.device);

      if (!target && avd) {
        const available = devices.find((d) => d.name === avd);
        if (!available) {
          console.error(`AVD "${avd}" not found.`);
          process.exit(1);
        }
        console.log(`Booting ${avd}...`);
        const serial = await bootDevice({ sdk, avdName: avd });
        devices = await listDevices();
        target = devices.find((d) => d.serial === serial);
      }

      if (!target) {
        const running = devices.filter((d) => d.state === "running");
        if (running.length === 1) {
          target = running[0];
        } else if (running.length === 0) {
          console.error("No running emulator. Specify an AVD name to boot.");
          process.exit(1);
        } else {
          console.error("Multiple emulators running. Specify --device or an AVD name.");
          process.exit(1);
        }
      }

      if (!target) {
        console.error("No target device.");
        process.exit(1);
      }

      const session = new Session({
        device: target,
        port: parseInt(opts.port, 10),
        host: opts.host,
      });

      try {
        const { url } = await session.start();
        if (!opts.quiet) {
          console.log(
            `Attached to ${target.name} [${target.profile}] (${target.serial})`,
          );
          console.log(`Preview: ${url}`);
        } else {
          process.stdout.write(JSON.stringify({ device: target, url }) + "\n");
        }
      } catch (e) {
        console.error(`Failed to start: ${e}`);
        process.exit(1);
      }

      process.on("SIGINT", async () => {
        await session.stop();
        process.exit(0);
      });
    },
  );

program
  .command("kill [avd]")
  .description("Stop emulator(s) Porthole started")
  .action(async (avd: string | undefined) => {
    const sdk = findAndroidSdk();
    const devices = await listDevices();
    const targets = devices.filter(
      (d) =>
        d.state === "running" &&
        d.serial &&
        (avd ? d.name === avd : wasBootedByUs(d.serial)),
    );

    if (targets.length === 0) {
      console.log("No emulators to kill.");
      return;
    }

    for (const t of targets) {
      if (t.serial) {
        console.log(`Shutting down ${t.name} (${t.serial})...`);
        await shutdownDevice(sdk, t.serial);
      }
    }
  });

program
  .command("tap <x> <y>")
  .description("Touch at normalized 0..1 coordinates")
  .action(async (x: string, y: string) => {
    const nx = parseFloat(x);
    const ny = parseFloat(y);
    if (isNaN(nx) || isNaN(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
      console.error("Coordinates must be numbers in 0..1");
      process.exit(1);
    }
    console.log(`tap ${nx},${ny} — requires a running session (use 'start' first)`);
  });

program
  .command("key <keycode>")
  .description("Send a single Android keyevent")
  .action(async (keycode: string) => {
    const code = parseInt(keycode, 10);
    if (isNaN(code)) {
      console.error("Keycode must be a number");
      process.exit(1);
    }
    console.log(`key ${code} — requires a running session (use 'start' first)`);
  });

program
  .command("remote <button>")
  .description("D-pad / media remote button")
  .action(async (button: string) => {
    if (!(button in REMOTE_BUTTON_TO_KEYCODE)) {
      console.error(
        `Unknown button: ${button}. Valid: ${Object.keys(REMOTE_BUTTON_TO_KEYCODE).join(", ")}`,
      );
      process.exit(1);
    }
    console.log(`remote ${button} — requires a running session (use 'start' first)`);
  });

program
  .command("text <string>")
  .description("Type text")
  .action(async (text: string) => {
    console.log(`text "${text}" — requires a running session (use 'start' first)`);
  });

program
  .command("mcp")
  .description("Run the MCP server on stdio")
  .action(async () => {
    await startMcpServer();
  });

program.parse();
