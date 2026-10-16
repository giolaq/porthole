import { parseCrashes } from "../crashes.js";
import type { ActionContext } from "./context.js";
import { actionDevice } from "./context.js";
import { adb } from "./adb.js";
import { runAction } from "./run.js";

export async function logcat(
  ctx: ActionContext,
  lines = 100,
  filter?: string,
): Promise<string> {
  return runAction(ctx, "logcat", { lines, filter }, async () => {
    const args = ["logcat", "-d", "-t", String(lines)];
    if (filter) args.push(filter);
    return (await adb(actionDevice(ctx).serial, args, 8 * 1024 * 1024)).stdout;
  });
}

export async function crashes(ctx: ActionContext) {
  return runAction(ctx, "crashes", undefined, async () =>
    parseCrashes(
      (await adb(actionDevice(ctx).serial, ["logcat", "-d", "-t", "1000"])).stdout,
    ),
  );
}
