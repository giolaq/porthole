import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getSessionBytes,
  getSessionJson,
  postSessionJson,
} from "../../control-client.js";
import type { HumanAnnotation, HumanQuestion } from "../../protocol.js";
import type { SessionLink } from "../session-link.js";
import { guarded, ok } from "../result.js";

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "get_recent_activity",
    {
      title: "Recent activity",
      description: "Read recent human and agent actions",
      inputSchema: {
        since: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ since, limit }) =>
      guarded(async () => {
        const query = new URLSearchParams({
          since: String(since ?? 0),
          limit: String(limit ?? 100),
        });
        const { response } = await getSessionJson(
          `/api/activity?${query}`,
          link.options(),
        );
        return ok(response);
      }),
  );

  server.registerTool(
    "get_control_state",
    {
      title: "Control state",
      description: "Check whether a human has paused agent input",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      guarded(async () =>
        ok((await getSessionJson("/api/control", link.options())).response),
      ),
  );

  server.registerTool(
    "ask_human",
    {
      title: "Ask human",
      description: "Ask a question in the browser and wait for the human's answer",
      inputSchema: {
        question: z.string(),
        options: z.array(z.string()).optional(),
        timeoutSeconds: z.number().positive().max(1800).optional(),
      },
    },
    async ({ question, options, timeoutSeconds }) =>
      guarded(async () => {
        const timeoutMs = Math.round((timeoutSeconds ?? 300) * 1000);
        const { response } = await postSessionJson(
          "/api/questions",
          { text: question, options, timeoutMs },
          link.options(),
        );
        const created = response as HumanQuestion;
        let current = created;
        while (current.status === "open") {
          const next = await getSessionJson(
            `/api/questions/${encodeURIComponent(created.id)}?wait=30000`,
            link.options(),
          );
          current = next.response as HumanQuestion;
        }
        link.markAnswersRead();
        return ok(
          current.status === "answered"
            ? { answered: true, answer: current.answer?.text }
            : { answered: false, reason: "timeout" },
        );
      }),
  );

  server.registerTool(
    "get_annotations",
    {
      title: "Get annotations",
      description: "Read human notes and optional screenshot crops",
      inputSchema: {
        since: z.number().int().min(0).optional(),
        includeImages: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ since, includeImages }) =>
      guarded(async () => {
        const { response } = await getSessionJson(
          `/api/annotations?since=${since ?? 0}`,
          link.options(),
        );
        const annotations = (response as { annotations: HumanAnnotation[] }).annotations;
        const result = ok({ annotations });
        if (includeImages) {
          for (const note of annotations) {
            const png = await getSessionBytes(
              `/api/annotations/${note.id}/image`,
              link.options(),
            );
            result.content.push({
              type: "image",
              data: Buffer.from(png).toString("base64"),
              mimeType: "image/png",
            });
          }
        }
        for (const note of annotations) link.markAnnotationsRead(note.id);
        return result;
      }),
  );

  server.registerTool(
    "say",
    {
      title: "Say",
      description: "Narrate intent to the human activity feed",
      inputSchema: { message: z.string() },
    },
    async ({ message }) =>
      guarded(async () => {
        await postSessionJson("/api/say", { message }, link.options());
        return ok({ ok: true }, undefined, false);
      }),
  );
}
