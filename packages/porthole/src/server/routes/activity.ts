import type { Route } from "../router.js";
import { actionContext, sendJson } from "../router.js";

export const activityRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/activity",
    handler: async (ctx) => {
      const since = Math.max(0, Number(ctx.url.searchParams.get("since") ?? 0) || 0);
      const limit = Math.min(
        500,
        Math.max(1, Number(ctx.url.searchParams.get("limit") ?? 100) || 100),
      );
      const wait = Math.min(
        30_000,
        Math.max(0, Number(ctx.url.searchParams.get("wait") ?? 0) || 0),
      );
      const bus = ctx.opts.activityBus;
      if (!bus) {
        await sendJson(ctx.res, 200, { events: [] });
        return;
      }
      const deviceId = actionContext(ctx).deviceId;
      let events = bus.since(since, limit, deviceId);
      if (events.length === 0 && wait > 0) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            unsubscribe();
            resolve();
          }, wait);
          const unsubscribe = bus.subscribe((event) => {
            if (event.id > since && event.deviceId === deviceId) {
              clearTimeout(timeout);
              unsubscribe();
              resolve();
            }
          });
          ctx.res.once("close", () => {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          });
        });
        events = bus.since(since, limit, deviceId);
      }
      if (!ctx.res.destroyed) await sendJson(ctx.res, 200, { events });
    },
  },
];
