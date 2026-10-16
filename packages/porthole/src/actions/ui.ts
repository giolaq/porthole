import {
  dumpUi as adbDumpUi,
  findElement as adbFindElement,
  getFocusedNode,
  waitForUiText,
} from "../ui-tree.js";
import {
  focusOn as adbFocusOn,
  type FocusQuery,
  type FocusOnOptions,
} from "../focus-navigation.js";
import type { ActionContext } from "./context.js";
import { actionDevice } from "./context.js";
import { sendInput } from "./input.js";
import { PortholeError } from "./errors.js";

export async function dumpUi(ctx: ActionContext, filter?: string) {
  return adbDumpUi(actionDevice(ctx).serial, filter);
}

export async function getFocused(ctx: ActionContext) {
  return getFocusedNode(actionDevice(ctx).serial);
}

export async function focusOn(
  ctx: ActionContext,
  query: FocusQuery,
  opts: FocusOnOptions = {},
) {
  const serial = actionDevice(ctx).serial;
  return adbFocusOn(
    serial,
    query,
    (button) => sendInput(ctx, { kind: "remote", button }),
    opts,
  );
}

export async function findElement(
  ctx: ActionContext,
  query: { text?: string; resourceId?: string; tap?: boolean },
) {
  const device = actionDevice(ctx);
  const node = await adbFindElement(device.serial, query);
  if (node && query.tap && device.profile === "phone") {
    if (!node.normalizedCenter) {
      throw new PortholeError(
        "BAD_REQUEST",
        "Could not determine display size from the UI dump.",
        400,
      );
    }
    await sendInput(ctx, { kind: "touch", phase: "down", ...node.normalizedCenter });
    await sendInput(ctx, { kind: "touch", phase: "up", ...node.normalizedCenter });
  }
  return node;
}

export async function waitFor(ctx: ActionContext, text: string, timeoutMs = 10_000) {
  try {
    return await waitForUiText(actionDevice(ctx).serial, text, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PortholeError(
      message.includes("Timed out") ? "TIMEOUT" : "ADB_FAILED",
      message,
      400,
      true,
    );
  }
}
