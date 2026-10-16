import type { ActionContext } from "./context.js";
import { asPortholeError, PortholeError } from "./errors.js";

const READ_ONLY_ACTIONS = new Set([
  "screenshot",
  "capture_frame",
  "dump_ui",
  "get_focused",
  "find_element",
  "wait_for",
  "list_apps",
  "logcat",
  "crashes",
  "get_recent_activity",
]);

export function isMutatingAction(
  name: string,
  params?: Record<string, unknown>,
): boolean {
  if (name === "find_element") return params?.tap === true;
  return !READ_ONLY_ACTIONS.has(name);
}

export function assertInputAllowedByControl(
  ctx: ActionContext,
  name: string,
  params?: Record<string, unknown>,
): void {
  if (!isMutatingAction(name, params) || ctx.actor.kind === "human") return;
  if (ctx.session.getControlState?.(ctx.deviceId)?.holder === "human") {
    throw new PortholeError(
      "PAUSED_BY_HUMAN",
      `A human has taken control of ${ctx.deviceId}. Wait, or call ask_human.`,
      423,
      true,
    );
  }
}

export async function runAction<T>(
  ctx: ActionContext,
  name: string,
  params: Record<string, unknown> | undefined,
  fn: () => Promise<T>,
  publish = true,
): Promise<T> {
  const started = Date.now();
  try {
    assertInputAllowedByControl(ctx, name, params);
    const result = await fn();
    if (publish)
      ctx.session.activityBus?.publish({
        deviceId: ctx.deviceId,
        actor: ctx.actor,
        action: name,
        params,
        outcome: "ok",
        durationMs: Date.now() - started,
      });
    return result;
  } catch (error) {
    const converted = asPortholeError(error);
    ctx.session.activityBus?.publish({
      deviceId: ctx.deviceId,
      actor: ctx.actor,
      action: name,
      params,
      outcome: converted.code === "PAUSED_BY_HUMAN" ? "rejected" : "error",
      error: { code: converted.code, message: converted.message },
      durationMs: Date.now() - started,
    });
    throw converted;
  }
}
