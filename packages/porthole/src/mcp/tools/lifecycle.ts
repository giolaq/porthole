import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { adbBin, bootDevice, findAndroidSdk, listDevices } from "../../device-manager.js";
import type { SessionLink } from "../session-link.js";
import { guarded, ok } from "../result.js";
import { PortholeError } from "../../actions/errors.js";

const execFileAsync = promisify(execFile);

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "list_devices",
    {
      title: "List devices",
      description: "List available AVDs and running emulators with their profiles",
      inputSchema: {},
      outputSchema: { devices: z.array(z.unknown()) },
      annotations: { readOnlyHint: true },
    },
    async () =>
      guarded(async () => {
        const devices = await listDevices();
        return ok({ devices }, JSON.stringify({ devices }, null, 2));
      }),
  );

  server.registerTool(
    "boot_device",
    {
      title: "Boot device",
      description: "Boot an AVD by name",
      inputSchema: { avdName: z.string().describe("AVD name to boot") },
    },
    async ({ avdName }) =>
      guarded(async () => {
        const serial = await bootDevice({ sdk: findAndroidSdk(), avdName });
        return ok({ ok: true, avdName, serial }, undefined, false);
      }),
  );

  server.registerTool(
    "wait_for_boot",
    {
      title: "Wait for boot",
      description: "Wait until a running emulator reports sys.boot_completed=1",
      inputSchema: { serial: z.string().optional(), timeoutMs: z.number().optional() },
    },
    async ({ serial, timeoutMs }) =>
      guarded(async () => {
        const target = serial ?? link.serial();
        if (!target)
          throw new PortholeError("NO_DEVICE", "No serial provided or attached.", 503);
        const started = Date.now();
        while (Date.now() - started < (timeoutMs ?? 120_000)) {
          const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), [
            "-s",
            target,
            "shell",
            "getprop",
            "sys.boot_completed",
          ]);
          if (stdout.trim() === "1")
            return ok({ ok: true, serial: target }, undefined, false);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new PortholeError(
          "TIMEOUT",
          `Timed out waiting for ${target} to boot.`,
          408,
          true,
        );
      }),
  );

  server.registerTool(
    "attach_device",
    {
      title: "Attach device",
      description: "Attach to a running emulator for input and screenshots",
      inputSchema: {
        serial: z.string().describe("Device serial (e.g. emulator-5554)"),
        port: z.number().int().positive().optional(),
      },
    },
    async ({ serial, port }) =>
      guarded(async () => {
        const session = await link.attach(serial, port);
        return ok(
          { serial, port: session.port },
          `Attached to ${session.avdName} [${session.profile}] (${serial})`,
          false,
        );
      }),
  );
}
