import { describe, expect, it } from "vitest";
import { isMutatingAction, runAction } from "../actions/run.js";
import type { ActionContext } from "../actions/context.js";
import { FakeEngine } from "./helpers/fake-engine.js";

describe("action control policy", () => {
  it("classifies conditional element taps as mutating", () => {
    expect(isMutatingAction("find_element", { tap: false })).toBe(false);
    expect(isMutatingAction("find_element", { tap: true })).toBe(true);
    expect(isMutatingAction("screenshot")).toBe(false);
    expect(isMutatingAction("remote")).toBe(true);
  });
  it("allows agent observation while a human holds control", async () => {
    const engine = new FakeEngine();
    const ctx: ActionContext = {
      actor: { kind: "agent", id: "mcp" },
      deviceId: "device",
      session: {
        getEngine: () => engine,
        getDevice: () => ({
          name: "TV",
          serial: "device",
          profile: "tv",
          state: "running",
        }),
        serial: () => "device",
        defaultDeviceId: () => "device",
        sendInput: async () => undefined,
        getControlState: () => ({ holder: "human", since: new Date().toISOString() }),
      },
    };
    await expect(
      runAction(ctx, "screenshot", undefined, async () => "observed"),
    ).resolves.toBe("observed");
    await expect(
      runAction(ctx, "remote", { button: "select" }, async () => "acted"),
    ).rejects.toMatchObject({
      code: "PAUSED_BY_HUMAN",
      httpStatus: 423,
      retryable: true,
    });
  });
});
