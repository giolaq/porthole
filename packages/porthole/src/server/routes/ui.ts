import type { Route } from "../router.js";
import { dumpUi, findElement, getFocusedNode, waitForUiText } from "../../ui-tree.js";
import { focusOn } from "../../focus-navigation.js";
import { readJson, sendJson, withSerial } from "../router.js";

export const uiRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/ui",
    handler: async (ctx) => {
      const { res, deviceId, url: parsedUrl } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          await sendJson(res, 200, {
            ok: true,
            tree: await dumpUi(serial, parsedUrl.searchParams.get("filter") ?? undefined),
          });
        },
      );
      return;
    },
  },
  {
    method: "GET",
    path: "/api/focused",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          await sendJson(res, 200, { ok: true, node: await getFocusedNode(serial) });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/focus_on",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getEngine, getDevice, handleInput } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          const text = typeof body.text === "string" ? body.text : undefined;
          const resourceId =
            typeof body.resourceId === "string" ? body.resourceId : undefined;
          const contentDesc =
            typeof body.contentDesc === "string" ? body.contentDesc : undefined;
          if (!text && !resourceId && !contentDesc) {
            throw new Error("text, resourceId, or contentDesc is required.");
          }
          const maxSteps =
            typeof body.maxSteps === "number" && Number.isInteger(body.maxSteps)
              ? body.maxSteps
              : undefined;
          const result = await focusOn(
            serial,
            { text, resourceId, contentDesc },
            async (button) => {
              const event = { kind: "remote" as const, button };
              if (handleInput) await handleInput(event, deviceId);
              else await getEngine(deviceId)?.sendInput(event);
            },
            { select: body.select === true, maxSteps },
          );
          await sendJson(res, 200, { ok: true, result });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/find",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getEngine, getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial, device) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          const text = typeof body.text === "string" ? body.text : undefined;
          const resourceId =
            typeof body.resourceId === "string" ? body.resourceId : undefined;
          if (!text && !resourceId) {
            throw new Error("text or resourceId is required.");
          }
          const node = await findElement(serial, { text, resourceId });
          if (node && body.tap === true && device.profile === "phone") {
            if (!node.normalizedCenter) {
              throw new Error("Could not determine display size from the UI dump.");
            }
            const engine = getEngine(deviceId);
            await engine?.sendInput({
              kind: "touch",
              phase: "down",
              ...node.normalizedCenter,
            });
            await engine?.sendInput({
              kind: "touch",
              phase: "up",
              ...node.normalizedCenter,
            });
          }
          await sendJson(res, 200, { ok: true, node });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/wait_for",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          if (typeof body.text !== "string") throw new Error("text is required.");
          const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : 10_000;
          await sendJson(res, 200, {
            ok: true,
            node: await waitForUiText(serial, body.text, timeoutMs),
          });
        },
      );
      return;
    },
  },
];
