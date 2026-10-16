import type { Route } from "../router.js";
import { actionContext, readJson, sendJson } from "../router.js";
import { screenshot } from "../../actions/screen.js";
import { PortholeError } from "../../actions/errors.js";
import type { AnnotationRect } from "../../annotations.js";

function store(ctx: Parameters<Route["handler"]>[0]) {
  const value = ctx.opts.annotationStore;
  if (!value)
    throw new PortholeError("BAD_REQUEST", "Annotation store unavailable.", 500);
  return value;
}

export const annotationRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/annotations",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      if (!body.rect || typeof body.rect !== "object" || typeof body.note !== "string") {
        throw new PortholeError("BAD_REQUEST", "rect and note are required.", 400);
      }
      const action = actionContext(ctx);
      const annotation = store(ctx).add(
        action.deviceId,
        action.actor,
        body.rect as AnnotationRect,
        body.note,
        await screenshot(action),
      );
      await sendJson(ctx.res, 200, annotation);
    },
  },
  {
    method: "GET",
    path: "/api/annotations",
    handler: async (ctx) => {
      const since = Number(ctx.url.searchParams.get("since") ?? 0) || 0;
      await sendJson(ctx.res, 200, {
        annotations: store(ctx).since(actionContext(ctx).deviceId, since),
      });
    },
  },
  {
    method: "GET",
    path: "/api/annotations/:id/image",
    handler: async (ctx) => {
      const png = store(ctx).image(Number(ctx.params?.id));
      ctx.res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
      });
      ctx.res.end(png);
    },
  },
  {
    method: "DELETE",
    path: "/api/annotations/:id",
    handler: async (ctx) => {
      const annotation = store(ctx).dismiss(Number(ctx.params?.id));
      await sendJson(ctx.res, 200, annotation);
    },
  },
];
