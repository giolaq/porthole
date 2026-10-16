import type { ActionContext } from "./context.js";
import { actionEngine } from "./context.js";
import { runAction } from "./run.js";

export async function screenshot(ctx: ActionContext): Promise<Uint8Array> {
  return runAction(ctx, "screenshot", undefined, () => actionEngine(ctx).screenshot());
}

export async function captureFrame(
  ctx: ActionContext,
): Promise<{ data: Uint8Array; mime: string }> {
  return runAction(ctx, "capture_frame", undefined, async () => {
    const engine = actionEngine(ctx);
    return (
      engine.captureFrame?.() ?? { data: await engine.screenshot(), mime: "image/png" }
    );
  });
}
