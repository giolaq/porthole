import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSessionJson, postSessionJson } from "../../control-client.js";
import type { SessionLink } from "../session-link.js";
import { guarded, ok } from "../result.js";

function data(response: unknown, key: string): unknown {
  return response && typeof response === "object"
    ? (response as Record<string, unknown>)[key]
    : undefined;
}

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "dump_ui",
    {
      title: "Dump UI",
      description: "Dump the Android UI hierarchy as JSON",
      inputSchema: {
        filter: z.string().optional(),
      },
      outputSchema: { tree: z.array(z.unknown()) },
      annotations: { readOnlyHint: true },
    },
    async ({ filter }) =>
      guarded(async () => {
        const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
        const { response } = await getSessionJson(`/api/ui${query}`, link.options());
        const tree = data(response, "tree");
        return ok({ tree }, JSON.stringify(tree, null, 2));
      }),
  );
  server.registerTool(
    "get_focused",
    {
      title: "Get focused",
      description: "Return the focused UI node, useful for Android TV focus testing",
      inputSchema: {},
      outputSchema: { node: z.unknown() },
    },
    async () =>
      guarded(async () => {
        const { response } = await getSessionJson("/api/focused", link.options());
        const node = data(response, "node");
        return ok({ node }, JSON.stringify(node, null, 2));
      }),
  );
  server.registerTool(
    "focus_on",
    {
      title: "Focus on",
      description: "Move Android TV D-pad focus to a matching UI node",
      inputSchema: {
        text: z.string().optional(),
        resourceId: z.string().optional(),
        contentDesc: z.string().optional(),
        select: z.boolean().optional(),
        maxSteps: z.number().int().positive().optional(),
      },
    },
    async (args) =>
      guarded(async () => {
        const { response } = await postSessionJson("/api/focus_on", args, link.options());
        return ok(
          data(response, "result"),
          JSON.stringify(data(response, "result")),
          false,
        );
      }),
  );
  server.registerTool(
    "find_element",
    {
      title: "Find element",
      description:
        "Find a UI element by text or resource id and optionally tap it on phone profiles",
      inputSchema: {
        text: z.string().optional(),
        resourceId: z.string().optional(),
        tap: z.boolean().optional(),
      },
      outputSchema: { node: z.unknown() },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guarded(async () => {
        const { response } = await postSessionJson("/api/find", args, link.options());
        const node = data(response, "node");
        return ok({ node }, JSON.stringify(node, null, 2));
      }),
  );
  server.registerTool(
    "wait_for",
    {
      title: "Wait for",
      description: "Wait for text to appear in the UI hierarchy",
      inputSchema: {
        text: z.string(),
        timeoutMs: z.number().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guarded(async () => {
        const { response } = await postSessionJson("/api/wait_for", args, link.options());
        return ok(
          data(response, "node"),
          JSON.stringify(data(response, "node"), null, 2),
          false,
        );
      }),
  );
}
