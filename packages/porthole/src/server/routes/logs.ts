import type { Route } from "../router.js";
import { actionContext, sendJson } from "../router.js";
import { logcat, crashes } from "../../actions/logs.js";

export const logsRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/logcat",
    handler: async (ctx) => {
      const lines = Number(ctx.url.searchParams.get("lines") ?? "100");
      const filter = ctx.url.searchParams.get("filter") ?? undefined;
      await sendJson(ctx.res, 200, {
        ok: true,
        logcat: await logcat(actionContext(ctx), lines, filter),
      });
    },
  },
  {
    method: "GET",
    path: "/api/crashes",
    handler: async (ctx) => {
      await sendJson(ctx.res, 200, {
        ok: true,
        crashes: await crashes(actionContext(ctx)),
      });
    },
  },
];
