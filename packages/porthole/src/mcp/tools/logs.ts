import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSessionJson } from "../../control-client.js";
import type { SessionLink } from "../session-link.js";
import { guarded, ok } from "../result.js";

function field(response: unknown, key: string): unknown {
  return response && typeof response === "object"
    ? (response as Record<string, unknown>)[key]
    : undefined;
}

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "read_logcat",
    {
      title: "Read logcat",
      description: "Read recent logcat output from the device",
      inputSchema: {
        lines: z.number().optional(),
        filter: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ lines, filter }) =>
      guarded(async () => {
        const query = new URLSearchParams({ lines: String(lines ?? 50) });
        if (filter) query.set("filter", filter);
        const { response } = await getSessionJson(`/api/logcat?${query}`, link.options());
        return ok(null, String(field(response, "logcat") ?? ""), false);
      }),
  );
  server.registerTool(
    "get_crashes",
    {
      title: "Get crashes",
      description: "Return recent crash and ANR records",
      inputSchema: {},
      outputSchema: { crashes: z.array(z.unknown()) },
      annotations: { readOnlyHint: true },
    },
    async () =>
      guarded(async () => {
        const { response } = await getSessionJson("/api/crashes", link.options());
        const crashes = field(response, "crashes");
        return ok({ crashes }, JSON.stringify(crashes, null, 2));
      }),
  );
}
