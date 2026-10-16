import type { InputEvent } from "../input.js";
import { assertInputAllowed } from "../input-validation.js";
import { sendGesture } from "../gesture.js";
import type { ActionContext } from "./context.js";
import { actionDevice, actionEngine } from "./context.js";
import { PortholeError } from "./errors.js";

export async function sendInput(ctx: ActionContext, event: InputEvent): Promise<void> {
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
  if (event.kind === "gesture") {
    await sendGesture(event, (touch) => ctx.session.sendInput(touch, ctx.deviceId));
  } else {
    await ctx.session.sendInput(event, ctx.deviceId);
  }
}
