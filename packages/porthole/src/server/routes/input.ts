import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { sendInput } from "../../actions/input.js";
import { rotate, emu } from "../../actions/device.js";
import { PortholeError } from "../../actions/errors.js";
import { parseInputEvent } from "../../input-validation.js";

export const inputRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/input",
    handler: async (ctx) => {
      const event = parseInputEvent(await readJson(ctx.req));
      await sendInput(actionContext(ctx), event);
      await sendJson(ctx.res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    path: "/api/rotate",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      const rotation = await rotate(actionContext(ctx), String(body.orientation ?? ""));
      await sendJson(ctx.res, 200, { ok: true, rotation });
    },
  },
  {
    method: "POST",
    path: "/api/emu",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (
        !Array.isArray(body.args) ||
        !body.args.every((arg) => typeof arg === "string")
      ) {
        throw new PortholeError("BAD_REQUEST", "args must be an array of strings.", 400);
      }
      const stdout = await emu(actionContext(ctx), body.args);
      await sendJson(ctx.res, 200, { ok: true, stdout });
    },
  },
];
