import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { PortholeError } from "../../actions/errors.js";
import type { HumanQuestion } from "../../protocol.js";

function store(ctx: Parameters<Route["handler"]>[0]) {
  const value = ctx.opts.questionStore;
  if (!value) throw new PortholeError("BAD_REQUEST", "Question store unavailable.", 500);
  return value;
}

export const questionRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/questions",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (typeof body.text !== "string")
        throw new PortholeError("BAD_REQUEST", "Question text is required.", 400);
      if (
        body.options !== undefined &&
        (!Array.isArray(body.options) ||
          !body.options.every((value) => typeof value === "string"))
      ) {
        throw new PortholeError(
          "BAD_REQUEST",
          "options must be an array of strings.",
          400,
        );
      }
      const action = actionContext(ctx);
      const question = store(ctx).ask(
        action.deviceId,
        action.actor,
        body.text,
        body.options as string[] | undefined,
        typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
      );
      await sendJson(ctx.res, 200, question);
    },
  },
  {
    method: "GET",
    path: "/api/questions",
    handler: async (ctx) => {
      const status = ctx.url.searchParams.get("status") as HumanQuestion["status"] | null;
      const questions = store(ctx).list(actionContext(ctx).deviceId, status ?? undefined);
      await sendJson(ctx.res, 200, { questions });
    },
  },
  {
    method: "GET",
    path: "/api/questions/:id",
    handler: async (ctx) => {
      const id = ctx.params?.id ?? "";
      const wait = Math.min(
        30_000,
        Math.max(0, Number(ctx.url.searchParams.get("wait") ?? 0) || 0),
      );
      const question = await store(ctx).wait(id, wait);
      if (!ctx.res.destroyed) await sendJson(ctx.res, 200, question);
    },
  },
  {
    method: "POST",
    path: "/api/questions/:id/answer",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (typeof body.text !== "string")
        throw new PortholeError("BAD_REQUEST", "Answer text is required.", 400);
      const action = actionContext(ctx);
      if (action.actor.kind !== "human")
        throw new PortholeError(
          "BAD_REQUEST",
          "Only a human can answer a question.",
          403,
        );
      const question = store(ctx).answer(ctx.params?.id ?? "", body.text, action.actor);
      await sendJson(ctx.res, 200, question);
    },
  },
];
