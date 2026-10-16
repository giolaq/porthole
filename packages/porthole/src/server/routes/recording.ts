import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { startRecording, stopRecording } from "../../actions/recording.js";

export const recordingRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/recording/start",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      const path = typeof body.path === "string" ? body.path : undefined;
      await sendJson(ctx.res, 200, await startRecording(actionContext(ctx), path));
    },
  },
  {
    method: "POST",
    path: "/api/recording/stop",
    handler: async (ctx) => {
      await sendJson(ctx.res, 200, await stopRecording(actionContext(ctx)));
    },
  },
];
