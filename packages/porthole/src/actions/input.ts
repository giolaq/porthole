import type { InputEvent } from "../input.js";
import { assertInputAllowed } from "../input-validation.js";
import { sendGesture } from "../gesture.js";
import type { ActionContext, SessionHandle } from "./context.js";
import { actionDevice, actionEngine } from "./context.js";
import { PortholeError } from "./errors.js";
import { runAction } from "./run.js";

interface TouchStart {
  x: number;
  y: number;
  moved: boolean;
}
const touchStarts = new WeakMap<SessionHandle, Map<string, TouchStart>>();

function touches(ctx: ActionContext): Map<string, TouchStart> {
  let entries = touchStarts.get(ctx.session);
  if (!entries) {
    entries = new Map();
    touchStarts.set(ctx.session, entries);
  }
  return entries;
}
function actorKey(ctx: ActionContext): string {
  return `${ctx.deviceId}:${ctx.actor.kind}:${ctx.actor.id ?? ""}`;
}

export async function sendInput(ctx: ActionContext, event: InputEvent): Promise<void> {
  const key = actorKey(ctx);
  const pending = touches(ctx).get(key);
  let action: string = event.kind;
  let params: Record<string, unknown> = {};
  let publish = true;
  if (event.kind === "touch") {
    action = event.phase === "up" && pending?.moved ? "swipe" : "tap";
    params =
      event.phase === "up" && pending?.moved
        ? { x1: pending.x, y1: pending.y, x2: event.x, y2: event.y }
        : { x: event.x, y: event.y };
    publish = event.phase === "up";
  } else if (event.kind === "gesture") {
    action = event.type === "longpress" ? "long_press" : "swipe";
    params = {
      x1: event.x1,
      y1: event.y1,
      x2: event.type === "swipe" ? event.x2 : undefined,
      y2: event.type === "swipe" ? event.y2 : undefined,
      durationMs: event.durationMs,
    };
  } else if (event.kind === "key") {
    params = { keycode: event.keycode };
    publish = event.phase === "up";
  } else if (event.kind === "remote") {
    params = { button: event.button };
  } else {
    params = { text: event.text };
  }

  await runAction(
    ctx,
    action,
    params,
    async () => {
      const device = actionDevice(ctx);
      try {
        assertInputAllowed(device.profile, event);
      } catch (error) {
        throw new PortholeError(
          "TOUCH_NOT_SUPPORTED",
          error instanceof Error ? error.message : String(error),
          400,
        );
      }
      actionEngine(ctx);
      if (event.kind === "gesture")
        await sendGesture(event, (touch) => ctx.session.sendInput(touch, ctx.deviceId));
      else await ctx.session.sendInput(event, ctx.deviceId);
    },
    publish,
  );

  if (event.kind === "touch") {
    if (event.phase === "down")
      touches(ctx).set(key, { x: event.x, y: event.y, moved: false });
    else if (
      event.phase === "move" &&
      pending &&
      Math.hypot(event.x - pending.x, event.y - pending.y) > 0.01
    )
      pending.moved = true;
    else if (event.phase === "up") touches(ctx).delete(key);
  }
}
