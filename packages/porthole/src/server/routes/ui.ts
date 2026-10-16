import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { dumpUi, getFocused, focusOn, findElement, waitFor } from "../../actions/ui.js";
import { PortholeError } from "../../actions/errors.js";

export const uiRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/ui",
    handler: async (ctx) => {
      const tree = await dumpUi(
        actionContext(ctx),
        ctx.url.searchParams.get("filter") ?? undefined,
      );
      await sendJson(ctx.res, 200, { ok: true, tree });
    },
  },
  {
    method: "GET",
    path: "/api/focused",
    handler: async (ctx) => {
      const node = await getFocused(actionContext(ctx));
      await sendJson(ctx.res, 200, { ok: true, node });
    },
  },
  {
    method: "POST",
    path: "/api/focus_on",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      const text = typeof body.text === "string" ? body.text : undefined;
      const resourceId =
        typeof body.resourceId === "string" ? body.resourceId : undefined;
      const contentDesc =
        typeof body.contentDesc === "string" ? body.contentDesc : undefined;
      if (!text && !resourceId && !contentDesc)
        throw new PortholeError(
          "BAD_REQUEST",
          "text, resourceId, or contentDesc is required.",
          400,
        );
      const maxSteps =
        typeof body.maxSteps === "number" && Number.isInteger(body.maxSteps)
          ? body.maxSteps
          : undefined;
      const result = await focusOn(
        actionContext(ctx),
        { text, resourceId, contentDesc },
        { select: body.select === true, maxSteps },
      );
      await sendJson(ctx.res, 200, { ok: true, result });
    },
  },
  {
    method: "POST",
    path: "/api/find",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      const text = typeof body.text === "string" ? body.text : undefined;
      const resourceId =
        typeof body.resourceId === "string" ? body.resourceId : undefined;
      if (!text && !resourceId)
        throw new PortholeError("BAD_REQUEST", "text or resourceId is required.", 400);
      const node = await findElement(actionContext(ctx), {
        text,
        resourceId,
        tap: body.tap === true,
      });
      await sendJson(ctx.res, 200, { ok: true, node });
    },
  },
  {
    method: "POST",
    path: "/api/wait_for",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (typeof body.text !== "string")
        throw new PortholeError("BAD_REQUEST", "text is required.", 400);
      const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : 10_000;
      const node = await waitFor(actionContext(ctx), body.text, timeoutMs);
      await sendJson(ctx.res, 200, { ok: true, node });
    },
  },
];
