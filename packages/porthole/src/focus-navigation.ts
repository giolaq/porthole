import { AndroidKeycode, type RemoteButton } from "./keycodes.js";
import { dumpUi, findFocused, type UiNode } from "./ui-tree.js";

export type DpadDirection = "dpad_up" | "dpad_down" | "dpad_left" | "dpad_right";

export interface FocusQuery {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
}

export interface FocusStep {
  focused: string;
  direction: DpadDirection;
}

export interface FocusOnOptions {
  maxSteps?: number;
  select?: boolean;
}

export interface FocusOnResult {
  ok: true;
  steps: FocusStep[];
  selected: boolean;
  focused: UiNode;
}

export function chooseDpadDirection(
  tree: UiNode[],
  targetQuery: FocusQuery,
): DpadDirection | null {
  const target = findFocusableMatch(tree, targetQuery);
  if (!target) throw new Error(`Target not found: ${describeQuery(targetQuery)}`);
  const focused = findFocused(tree);
  if (!focused) throw new Error("No focused node found.");
  if (focusedMatches(focused, targetQuery)) return null;

  const from = nodeCenter(focused);
  const to = nodeCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "dpad_right" : "dpad_left";
  }
  return dy >= 0 ? "dpad_down" : "dpad_up";
}

export async function focusOn(
  serial: string,
  targetQuery: FocusQuery,
  sendRemote: (button: RemoteButton) => Promise<void>,
  opts: FocusOnOptions = {},
): Promise<FocusOnResult> {
  const maxSteps = opts.maxSteps ?? 15;
  const steps: FocusStep[] = [];
  const visits = new Map<string, number>();
  let triedPerpendicular = false;

  for (let step = 0; step <= maxSteps; step++) {
    const tree = await dumpUi(serial);
    const focused = findFocused(tree);
    if (!findFocusableMatch(tree, targetQuery)) {
      throw new Error(`Target not found: ${describeQuery(targetQuery)}`);
    }
    if (focused && focusedMatches(focused, targetQuery)) {
      if (opts.select) {
        await sendRemote("select");
      }
      return { ok: true, steps, selected: opts.select === true, focused };
    }
    if (!focused) throw new Error("No focused node found.");
    if (step === maxSteps) break;

    const focusKey = describeNode(focused);
    const count = (visits.get(focusKey) ?? 0) + 1;
    visits.set(focusKey, count);

    let direction = chooseDpadDirection(tree, targetQuery);
    if (!direction) {
      continue;
    }
    if (count >= 2 && !triedPerpendicular) {
      direction = perpendicular(direction);
      triedPerpendicular = true;
    }
    steps.push({ focused: focusKey, direction });
    await sendRemote(direction);
    await sleep(250);
  }

  throw new Error(
    `Could not focus ${describeQuery(targetQuery)} within ${maxSteps} steps. Visited: ${steps
      .map((step) => `${step.focused}->${step.direction}`)
      .join(", ")}`,
  );
}

export function remoteButtonKeycode(button: RemoteButton): number {
  switch (button) {
    case "dpad_up":
      return AndroidKeycode.KEYCODE_DPAD_UP;
    case "dpad_down":
      return AndroidKeycode.KEYCODE_DPAD_DOWN;
    case "dpad_left":
      return AndroidKeycode.KEYCODE_DPAD_LEFT;
    case "dpad_right":
      return AndroidKeycode.KEYCODE_DPAD_RIGHT;
    case "select":
      return AndroidKeycode.KEYCODE_DPAD_CENTER;
    default:
      throw new Error(`Unsupported focus navigation button: ${button}`);
  }
}

function findFocusableMatch(tree: UiNode[], query: FocusQuery): UiNode | null {
  return flatten(tree).find((node) => node.enabled && nodeMatches(node, query)) ?? null;
}

// Leanback often focuses a card CONTAINER whose title/text lives on a child
// node — arrival must count when the query matches the focused node or any
// of its descendants, not just the container itself.
export function focusedMatches(focused: UiNode, query: FocusQuery): boolean {
  return [focused, ...flatten(focused.children)].some((node) => nodeMatches(node, query));
}

function nodeMatches(node: UiNode, query: FocusQuery): boolean {
  if (query.text && !node.text.includes(query.text)) return false;
  if (query.resourceId && !node.resourceId.includes(query.resourceId)) return false;
  if (query.contentDesc && !node.contentDesc.includes(query.contentDesc)) return false;
  return Boolean(query.text || query.resourceId || query.contentDesc);
}

function nodeCenter(node: UiNode): { x: number; y: number } {
  return {
    x: (node.bounds.l + node.bounds.r) / 2,
    y: (node.bounds.t + node.bounds.b) / 2,
  };
}

function flatten(nodes: UiNode[]): UiNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function describeQuery(query: FocusQuery): string {
  return [query.text, query.resourceId, query.contentDesc].filter(Boolean).join(" | ");
}

function describeNode(node: UiNode): string {
  return node.text || node.contentDesc || node.resourceId || node.class;
}

function perpendicular(direction: DpadDirection): DpadDirection {
  return direction === "dpad_left" || direction === "dpad_right"
    ? "dpad_down"
    : "dpad_right";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
