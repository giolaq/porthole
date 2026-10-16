import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { postSessionBytes, postSessionJson } from "../../control-client.js";
import type { SessionLink } from "../session-link.js";
import { guarded, ok } from "../result.js";

function responseField(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "open_url",
    {
      title: "Open URL",
      description: "Open a URL or Android deep link",
      inputSchema: { url: z.string() },
    },
    async ({ url }) =>
      guarded(async () => {
        const { response } = await postSessionJson(
          "/api/open_url",
          { url },
          link.options(),
        );
        return ok(null, String(responseField(response, "stdout") ?? ""), false);
      }),
  );
  server.registerTool(
    "stop_app",
    {
      title: "Stop app",
      description: "Force-stop an app package",
      inputSchema: { packageName: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ packageName }) =>
      guarded(async () => {
        await postSessionJson("/api/stop_app", { packageName }, link.options());
        return ok({ ok: true }, undefined, false);
      }),
  );
  server.registerTool(
    "clear_app",
    {
      title: "Clear app",
      description: "Clear app data for a package",
      inputSchema: { packageName: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ packageName }) =>
      guarded(async () => {
        await postSessionJson("/api/clear_app", { packageName }, link.options());
        return ok({ ok: true }, undefined, false);
      }),
  );
  server.registerTool(
    "install_apk",
    {
      title: "Install APK",
      description: "Install an APK on the attached emulator",
      inputSchema: { path: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ path }) =>
      guarded(async () => {
        const opts = link.options();
        const { response } = await postSessionBytes(
          "/api/install",
          await readFile(path),
          basename(path),
          opts,
        );
        return ok(
          {
            ok: true,
            serial: opts.device,
            stdout: responseField(response, "stdout"),
            stderr: responseField(response, "stderr"),
          },
          undefined,
          false,
        );
      }),
  );
}
