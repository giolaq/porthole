import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { PortholeError } from "../../actions/errors.js";

export const narrationRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/say",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (typeof body.message !== "string" || !body.message.trim()) {
        throw new PortholeError("BAD_REQUEST", "message is required.", 400);
      }
      const action = actionContext(ctx);
      ctx.opts.activityBus?.publish({
        deviceId: action.deviceId,
        actor: action.actor,
        action: "note",
        params: { message: body.message },
        outcome: "ok",
      });
      await sendJson(ctx.res, 200, { ok: true });
    },
  },
];
