import { describe, expect, it } from "vitest";
import { ActivityBus } from "../activity.js";

describe("ActivityBus", () => {
  it("keeps 500 ordered events and filters by id and device", () => {
    const bus = new ActivityBus();
    for (let i = 0; i < 501; i++)
      bus.publish({
        deviceId: i % 2 ? "a" : "b",
        actor: { kind: "agent" },
        action: "remote",
        outcome: "ok",
      });
    expect(bus.since(0, 500)[0]?.id).toBe(2);
    expect(bus.since(498, 10, "a").map((event) => event.id)).toEqual([500]);
  });
  it("notifies subscribers and sanitizes text and file contents", () => {
    const bus = new ActivityBus();
    const seen: number[] = [];
    const unsub = bus.subscribe((event) => seen.push(event.id));
    const event = bus.publish({
      deviceId: "a",
      actor: { kind: "human" },
      action: "note",
      outcome: "ok",
      params: { text: "x".repeat(300), file: "secret" },
    });
    unsub();
    bus.publish({
      deviceId: "a",
      actor: { kind: "human" },
      action: "tap",
      outcome: "ok",
    });
    expect(seen).toEqual([1]);
    expect((event.params?.text as string).length).toBe(200);
    expect(event.params?.file).toBeUndefined();
  });
});
