import { describe, expect, it } from "vitest";
import {
  interpolateGesture,
  scrollGesture,
  sendGesture,
  stripTimestamp,
} from "../gesture.js";

describe("interpolateGesture", () => {
  it("builds a timed swipe with exact endpoints and monotonic timestamps", () => {
    const touches = interpolateGesture({
      kind: "gesture",
      type: "swipe",
      x1: 0.1,
      y1: 0.2,
      x2: 0.9,
      y2: 0.8,
      durationMs: 300,
      steps: 3,
    });

    expect(touches.map((touch) => touch.phase)).toEqual([
      "down",
      "move",
      "move",
      "move",
      "up",
    ]);
    expect(touches[0]).toMatchObject({ x: 0.1, y: 0.2, atMs: 0 });
    expect(touches.at(-1)).toMatchObject({ x: 0.9, y: 0.8, atMs: 300 });

    for (let i = 1; i < touches.length; i++) {
      const current = touches[i];
      const previous = touches[i - 1];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      if (!current || !previous) throw new Error("missing touch");
      expect(current.atMs).toBeGreaterThan(previous.atMs);
    }
  });

  it("longpress holds at the same point for the requested duration", () => {
    const touches = interpolateGesture({
      kind: "gesture",
      type: "longpress",
      x1: 0.4,
      y1: 0.6,
      durationMs: 750,
    });

    expect(touches).toEqual([
      { kind: "touch", phase: "down", x: 0.4, y: 0.6, atMs: 0 },
      { kind: "touch", phase: "up", x: 0.4, y: 0.6, atMs: 750 },
    ]);
  });
});

describe("sendGesture", () => {
  it("sends stripped touch events separated by deltas", async () => {
    const sent: unknown[] = [];
    const sleeps: number[] = [];

    await sendGesture(
      {
        kind: "gesture",
        type: "swipe",
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        durationMs: 100,
        steps: 1,
      },
      async (event) => {
        sent.push(event);
      },
      async (ms) => {
        sleeps.push(ms);
      },
    );

    expect(sleeps).toEqual([50, 50]);
    expect(sent).toEqual([
      { kind: "touch", phase: "down", x: 0, y: 0 },
      { kind: "touch", phase: "move", x: 0.5, y: 0.5 },
      { kind: "touch", phase: "up", x: 1, y: 1 },
    ]);
  });
});

describe("scrollGesture", () => {
  it("maps scrolling down to an upward centered swipe", () => {
    expect(scrollGesture("down", 0.4)).toEqual({
      kind: "gesture",
      type: "swipe",
      x1: 0.5,
      y1: 0.7,
      x2: 0.5,
      y2: 0.3,
    });
  });

  it("maps horizontal scrolls to centered swipes", () => {
    expect(scrollGesture("right", 1)).toMatchObject({
      x1: 1,
      y1: 0.5,
      x2: 0,
      y2: 0.5,
    });
  });
});

describe("stripTimestamp", () => {
  it("removes interpolation timing before engine input", () => {
    expect(
      stripTimestamp({ kind: "touch", phase: "move", x: 0.1, y: 0.2, atMs: 10 }),
    ).toEqual({ kind: "touch", phase: "move", x: 0.1, y: 0.2 });
  });
});
