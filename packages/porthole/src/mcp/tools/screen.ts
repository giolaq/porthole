import { readFile, writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchSessionScreenshot, postSessionJson } from "../../control-client.js";
import { comparePngScreens, parseDiffRegion } from "../../screen-diff.js";
import type { SessionLink } from "../session-link.js";
import { guarded, image, ok } from "../result.js";

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "screenshot",
    {
      title: "Screenshot",
      description: "Take a screenshot of the current device screen",
      inputSchema: {
        save: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ save }) =>
      guarded(async () => {
        const { png } = await fetchSessionScreenshot(link.options());
        if (save) await writeFile(save, png);
        return image(png, save);
      }),
  );
  server.registerTool(
    "assert_screen",
    {
      title: "Assert screen",
      description: "Compare the current screenshot against a PNG baseline",
      inputSchema: {
        baselinePath: z.string(),
        threshold: z.number().min(0).max(1).optional(),
        region: z.string().optional(),
      },
      outputSchema: { ok: z.boolean(), mismatchRatio: z.number() },
      annotations: { readOnlyHint: true },
    },
    async ({ baselinePath, threshold, region }) =>
      guarded(async () => {
        const { png } = await fetchSessionScreenshot(link.options());
        const result = comparePngScreens(await readFile(baselinePath), png, {
          thresholdRatio: threshold,
          region: region === undefined ? undefined : parseDiffRegion(region),
        });
        const payload = { ok: result.ok, mismatchRatio: result.mismatchRatio };
        return ok(payload);
      }),
  );
  server.registerTool(
    "start_recording",
    {
      title: "Start recording",
      description: "Start recording the active H.264 stream to MP4",
      inputSchema: {
        path: z.string().optional(),
      },
    },
    async ({ path }) =>
      guarded(async () => {
        const { response } = await postSessionJson(
          "/api/recording/start",
          { path },
          link.options(),
        );
        const result = { ok: true, ...(response as object) };
        return ok(result, JSON.stringify(result), false);
      }),
  );
  server.registerTool(
    "stop_recording",
    {
      title: "Stop recording",
      description: "Stop recording and write the MP4 file",
      inputSchema: {},
    },
    async () =>
      guarded(async () => {
        const { response } = await postSessionJson(
          "/api/recording/stop",
          {},
          link.options(),
        );
        const result = { ok: true, ...(response as object) };
        return ok(result, JSON.stringify(result), false);
      }),
  );
}
