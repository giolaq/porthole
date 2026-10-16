import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { PortholeError } from "../../actions/errors.js";

export const controlRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/control",
    handler: async (ctx) => {
      const action = actionContext(ctx);
      await sendJson(
        ctx.res,
        200,
        action.session.getControlState?.(action.deviceId) ?? {
          holder: "shared",
          since: new Date().toISOString(),
        },
      );
    },
  },
  {
    method: "POST",
    path: "/api/control",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (body.holder !== "human" && body.holder !== "shared")
        throw new PortholeError("BAD_REQUEST", "holder must be human or shared.", 400);
      const action = actionContext(ctx);
      const state = ctx.opts.setControlState?.(
        action.deviceId,
        body.holder,
        action.actor,
        typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined,
      );
      if (!state)
        throw new PortholeError("BAD_REQUEST", "Control state unavailable.", 400);
      await sendJson(ctx.res, 200, state);
    },
  },
];
