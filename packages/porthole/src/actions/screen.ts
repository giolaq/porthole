import type { ActionContext } from "./context.js";
import { actionEngine } from "./context.js";

export async function screenshot(ctx: ActionContext): Promise<Uint8Array> {
  return actionEngine(ctx).screenshot();
}

export async function captureFrame(
  ctx: ActionContext,
): Promise<{ data: Uint8Array; mime: string }> {
  const engine = actionEngine(ctx);
  return (
    engine.captureFrame?.() ?? { data: await engine.screenshot(), mime: "image/png" }
  );
}
