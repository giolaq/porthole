import type { Route } from "../router.js";
import {
  actionContext,
  readJson,
  readBytes,
  sendJson,
  sanitizeFilename,
} from "../router.js";
import {
  openUrl,
  stopApp,
  clearApp,
  listApps,
  launch,
  installApk,
  pushFile,
} from "../../actions/apps.js";
import { PortholeError } from "../../actions/errors.js";

function bodyValue(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string")
    throw new PortholeError("BAD_REQUEST", `${key} is required.`, 400);
  return value;
}

export const appsRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/open_url",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      const stdout = await openUrl(actionContext(ctx), bodyValue(body, "url"));
      await sendJson(ctx.res, 200, { ok: true, stdout });
    },
  },
  {
    method: "POST",
    path: "/api/stop_app",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      await stopApp(actionContext(ctx), bodyValue(body, "packageName"));
      await sendJson(ctx.res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    path: "/api/clear_app",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      await clearApp(actionContext(ctx), bodyValue(body, "packageName"));
      await sendJson(ctx.res, 200, { ok: true });
    },
  },
  {
    method: "GET",
    path: "/api/apps",
    handler: async (ctx) => {
      const packages = await listApps(actionContext(ctx));
      await sendJson(ctx.res, 200, { ok: true, packages });
    },
  },
  {
    method: "POST",
    path: "/api/launch",
    handler: async (ctx) => {
      const body = (await readJson(ctx.req)) as Record<string, unknown>;
      await launch(actionContext(ctx), bodyValue(body, "packageName"));
      await sendJson(ctx.res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    path: "/api/install",
    handler: async (ctx) => {
      const filename = sanitizeFilename(
        ctx.req.headers["x-porthole-filename"] ?? "drop.apk",
      );
      const { stdout, stderr } = (await installApk(
        actionContext(ctx),
        filename,
        await readBytes(ctx.req),
      )) as { stdout: string; stderr: string };
      await sendJson(ctx.res, 200, { ok: true, stdout, stderr });
    },
  },
  {
    method: "POST",
    path: "/api/push",
    handler: async (ctx) => {
      const filename = sanitizeFilename(
        ctx.req.headers["x-porthole-filename"] ?? "porthole-drop",
      );
      const path = await pushFile(actionContext(ctx), filename, await readBytes(ctx.req));
      await sendJson(ctx.res, 200, { ok: true, path });
    },
  },
];
