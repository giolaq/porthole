import type { ActionContext } from "./context.js";
import { actionDevice } from "./context.js";
import { adb } from "./adb.js";
import { PortholeError } from "./errors.js";
import { runAction } from "./run.js";

export async function rotate(ctx: ActionContext, orientation: string): Promise<number> {
  return runAction(ctx, "rotate", { orientation }, async () => {
    const device = actionDevice(ctx);
    if (device.profile === "tv")
      throw new PortholeError(
        "BAD_REQUEST",
        "Rotation controls are only available for phone profiles.",
        400,
      );
    const rotation =
      orientation === "portrait"
        ? 0
        : orientation === "landscape" || orientation === "right"
          ? 1
          : orientation === "left"
            ? 3
            : undefined;
    if (rotation === undefined)
      throw new PortholeError(
        "BAD_REQUEST",
        "orientation must be portrait, landscape, left, or right.",
        400,
      );
    await adb(device.serial, [
      "shell",
      "settings",
      "put",
      "system",
      "accelerometer_rotation",
      "0",
    ]);
    await adb(device.serial, [
      "shell",
      "settings",
      "put",
      "system",
      "user_rotation",
      String(rotation),
    ]);
    return rotation;
  });
}

export async function emu(ctx: ActionContext, args: string[]): Promise<string> {
  return runAction(
    ctx,
    "emu",
    { args },
    async () => (await adb(actionDevice(ctx).serial, ["emu", ...args])).stdout,
  );
}
