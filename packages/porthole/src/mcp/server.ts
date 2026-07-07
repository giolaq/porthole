import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listDevices, findAndroidSdk, bootDevice } from "../device-manager.js";
import type { RemoteButton } from "../keycodes.js";
import { ScrcpyEngine } from "../engine/scrcpy-engine.js";
import type { Engine } from "../engine/types.js";
import type { InputEvent } from "../input.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

let engine: Engine | null = null;

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
      return { content: [{ type: "text", text: JSON.stringify(devices, null, 2) }] };
    },
  );

  server.tool(
    "boot_device",
    "Boot an AVD by name",
    { avdName: z.string().describe("AVD name to boot") },
    async ({ avdName }) => {
      const sdk = findAndroidSdk();
      const serial = await bootDevice({ sdk, avdName });
      return { content: [{ type: "text", text: `Booted ${avdName} (${serial})` }] };
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
        serverPath: join(REPO_ROOT, "assets", "scrcpy-server"),
      });
      await engine.start();

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

      const devices = await listDevices();
      const device = devices.find((d) => d.serial !== null);
      if (!device?.serial) {
        return { content: [{ type: "text", text: "No device serial" }] };
      }

      const args = ["-s", device.serial, "logcat", "-d", "-t", String(lines ?? 50)];
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
