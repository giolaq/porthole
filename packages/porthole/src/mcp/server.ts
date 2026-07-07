import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { adbBin, listDevices, findAndroidSdk, bootDevice } from "../device-manager.js";
import type { RemoteButton } from "../keycodes.js";
import { ScrcpyEngine } from "../engine/scrcpy-engine.js";
import type { Engine } from "../engine/types.js";
import type { InputEvent } from "../input.js";
import { scrcpyServerPath } from "../paths.js";

let engine: Engine | null = null;
let activeSerial: string | null = null;

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "porthole",
    version: "0.0.1",
  });

  server.tool(
    "list_devices",
    "List available AVDs and running emulators with their profiles",
    {},
    async () => {
      const devices = await listDevices();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ devices }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "boot_device",
    "Boot an AVD by name",
    { avdName: z.string().describe("AVD name to boot") },
    async ({ avdName }) => {
      const sdk = findAndroidSdk();
      const serial = await bootDevice({ sdk, avdName });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, avdName, serial }),
          },
        ],
      };
    },
  );

  server.tool(
    "wait_for_boot",
    "Wait until a running emulator reports sys.boot_completed=1",
    {
      serial: z
        .string()
        .optional()
        .describe("Device serial; defaults to the attached device"),
      timeoutMs: z.number().optional().describe("Timeout in milliseconds"),
    },
    async ({ serial, timeoutMs }) => {
      const targetSerial = serial ?? activeSerial;
      if (!targetSerial) {
        return { content: [{ type: "text", text: "No serial provided or attached." }] };
      }
      await waitForBootCompleted(targetSerial, timeoutMs ?? 120_000);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, serial: targetSerial }),
          },
        ],
      };
    },
  );

  server.tool(
    "attach_device",
    "Attach to a running emulator for input and screenshots",
    {
      serial: z.string().describe("Device serial (e.g. emulator-5554)"),
    },
    async ({ serial }) => {
      const devices = await listDevices();
      const device = devices.find((d) => d.serial === serial);
      if (!device) {
        return { content: [{ type: "text", text: `Device ${serial} not found` }] };
      }

      if (engine) {
        await engine.stop();
      }

      engine = new ScrcpyEngine({
        serial,
        serverPath: scrcpyServerPath(),
      });
      await engine.start();
      activeSerial = serial;

      return {
        content: [
          {
            type: "text",
            text: `Attached to ${device.name} [${device.profile}] (${serial})`,
          },
        ],
      };
    },
  );

  server.tool(
    "tap",
    "Touch at normalized 0..1 coordinates",
    {
      x: z.number().min(0).max(1).describe("X coordinate (0..1)"),
      y: z.number().min(0).max(1).describe("Y coordinate (0..1)"),
    },
    async ({ x, y }) => {
      if (!engine) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      const events: InputEvent[] = [
        { kind: "touch", phase: "down", x, y },
        { kind: "touch", phase: "up", x, y },
      ];
      for (const ev of events) {
        await engine.sendInput(ev);
      }
      return { content: [{ type: "text", text: `Tapped at (${x}, ${y})` }] };
    },
  );

  server.tool(
    "key",
    "Send a single Android keyevent",
    { keycode: z.number().describe("Android keycode") },
    async ({ keycode }) => {
      if (!engine) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      await engine.sendInput({ kind: "key", phase: "down", keycode });
      await engine.sendInput({ kind: "key", phase: "up", keycode });
      return { content: [{ type: "text", text: `Key ${keycode} sent` }] };
    },
  );

  server.tool(
    "remote",
    "Press a TV remote button (D-pad, media, etc.)",
    {
      button: z
        .enum([
          "dpad_up",
          "dpad_down",
          "dpad_left",
          "dpad_right",
          "select",
          "back",
          "home",
          "menu",
          "play_pause",
          "rewind",
          "fast_forward",
          "volume_up",
          "volume_down",
        ])
        .describe("Remote button name"),
    },
    async ({ button }) => {
      if (!engine) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      await engine.sendInput({ kind: "remote", button: button as RemoteButton });
      return { content: [{ type: "text", text: `Remote: ${button}` }] };
    },
  );

  server.tool(
    "type_text",
    "Type text on the device",
    { text: z.string().describe("Text to type") },
    async ({ text }) => {
      if (!engine) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      await engine.sendInput({ kind: "text", text });
      return { content: [{ type: "text", text: `Typed: "${text}"` }] };
    },
  );

  server.tool(
    "screenshot",
    "Take a screenshot of the current device screen",
    {},
    async () => {
      if (!engine) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      const png = await engine.screenshot();
      const sharp = (await import("sharp")).default;
      const jpeg = await sharp(png)
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      return {
        content: [
          {
            type: "image",
            data: jpeg.toString("base64"),
            mimeType: "image/jpeg",
          },
        ],
      };
    },
  );

  server.tool(
    "install_apk",
    "Install an APK on the attached emulator",
    { path: z.string().describe("Local path to an APK file") },
    async ({ path }) => {
      if (!activeSerial) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      const { execFile: execFileCb } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileP = promisify(execFileCb);
      const { stdout, stderr } = await execFileP(adbBin(findAndroidSdk()), [
        "-s",
        activeSerial,
        "install",
        "-r",
        path,
      ]);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, serial: activeSerial, stdout, stderr }),
          },
        ],
      };
    },
  );

  server.tool(
    "read_logcat",
    "Read recent logcat output from the device",
    {
      lines: z.number().optional().describe("Number of lines (default 50)"),
      filter: z.string().optional().describe("Logcat filter expression"),
    },
    async ({ lines, filter }) => {
      if (!engine) {
        return {
          content: [
            { type: "text", text: "No active session. Call attach_device first." },
          ],
        };
      }
      const { execFile: execFileCb } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileP = promisify(execFileCb);

      if (!activeSerial) {
        return { content: [{ type: "text", text: "No device serial" }] };
      }

      const args = ["-s", activeSerial, "logcat", "-d", "-t", String(lines ?? 50)];
      if (filter) args.push(filter);

      try {
        const { stdout } = await execFileP("adb", args);
        return { content: [{ type: "text", text: stdout }] };
      } catch (e) {
        return { content: [{ type: "text", text: `logcat error: ${e}` }] };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function waitForBootCompleted(serial: string, timeoutMs: number): Promise<void> {
  const { execFile: execFileCb } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileP = promisify(execFileCb);
  const adb = adbBin(findAndroidSdk());
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const { stdout } = await execFileP(adb, [
        "-s",
        serial,
        "shell",
        "getprop",
        "sys.boot_completed",
      ]);
      if (stdout.trim() === "1") return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${serial} to boot.`);
}
