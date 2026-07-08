import type {
  EngineInputEvent,
  GestureEvent,
  SwipeGestureEvent,
  TouchEvent,
} from "./input.js";

export interface TimedTouchEvent extends TouchEvent {
  atMs: number;
}

export const DEFAULT_SWIPE_DURATION_MS = 250;
export const DEFAULT_LONG_PRESS_DURATION_MS = 600;
export const DEFAULT_GESTURE_STEPS = 20;
export const DEFAULT_SCROLL_AMOUNT = 0.5;

export type ScrollDirection = "up" | "down" | "left" | "right";

export function scrollGesture(
  direction: ScrollDirection,
  amount = DEFAULT_SCROLL_AMOUNT,
  durationMs?: number,
): SwipeGestureEvent {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
    throw new Error("Scroll amount must be a number in 0..1.");
  }

  const half = amount / 2;
  const low = clamp01(0.5 - half);
  const high = clamp01(0.5 + half);
  const base = {
    kind: "gesture" as const,
    type: "swipe" as const,
    durationMs,
  };

  switch (direction) {
    case "up":
      return withoutUndefined({ ...base, x1: 0.5, y1: low, x2: 0.5, y2: high });
    case "down":
      return withoutUndefined({ ...base, x1: 0.5, y1: high, x2: 0.5, y2: low });
    case "left":
      return withoutUndefined({ ...base, x1: low, y1: 0.5, x2: high, y2: 0.5 });
    case "right":
      return withoutUndefined({ ...base, x1: high, y1: 0.5, x2: low, y2: 0.5 });
  }
}

export function interpolateGesture(event: GestureEvent): TimedTouchEvent[] {
  if (event.type === "longpress") {
    const durationMs = event.durationMs ?? DEFAULT_LONG_PRESS_DURATION_MS;
    assertGestureTiming(durationMs, 1);
    return [
      { kind: "touch", phase: "down", x: event.x1, y: event.y1, atMs: 0 },
      { kind: "touch", phase: "up", x: event.x1, y: event.y1, atMs: durationMs },
    ];
  }

  const durationMs = event.durationMs ?? DEFAULT_SWIPE_DURATION_MS;
  const steps = event.steps ?? DEFAULT_GESTURE_STEPS;
  assertGestureTiming(durationMs, steps);

  const touches: TimedTouchEvent[] = [
    { kind: "touch", phase: "down", x: event.x1, y: event.y1, atMs: 0 },
  ];

  for (let step = 1; step <= steps; step++) {
    const t = step / (steps + 1);
    touches.push({
      kind: "touch",
      phase: "move",
      x: lerp(event.x1, event.x2, t),
      y: lerp(event.y1, event.y2, t),
      atMs: Math.round(durationMs * t),
    });
  }

  touches.push({
    kind: "touch",
    phase: "up",
    x: event.x2,
    y: event.y2,
    atMs: durationMs,
  });

  return touches;
}

export async function sendGesture(
  event: GestureEvent,
  sendInput: (event: EngineInputEvent) => Promise<void>,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  let previousAtMs = 0;
  for (const touch of interpolateGesture(event)) {
    const waitMs = touch.atMs - previousAtMs;
    if (waitMs > 0) await sleep(waitMs);
    previousAtMs = touch.atMs;
    await sendInput(stripTimestamp(touch));
  }
}

export function stripTimestamp(event: TimedTouchEvent): TouchEvent {
  return {
    kind: "touch",
    phase: event.phase,
    x: event.x,
    y: event.y,
  };
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertGestureTiming(durationMs: number, steps: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Gesture duration must be a positive number.");
  }
  if (!Number.isInteger(steps) || steps <= 0) {
    throw new Error("Gesture steps must be a positive integer.");
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withoutUndefined(event: SwipeGestureEvent): SwipeGestureEvent {
  if (event.durationMs === undefined) {
    return {
      kind: event.kind,
      type: event.type,
      x1: event.x1,
      y1: event.y1,
      x2: event.x2,
      y2: event.y2,
    };
  }
  return event;
}
