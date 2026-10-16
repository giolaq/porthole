import { describe, expect, it } from "vitest";
import { ActivityBus } from "../activity.js";
import { createHttpServer } from "../server/http.js";
import { FakeEngine } from "./helpers/fake-engine.js";
import type { ControlState } from "../protocol.js";

describe("collaboration HTTP routes", () => {
  it("records actor activity and blocks agent input during human control", async () => {
    const bus = new ActivityBus();
    const engine = new FakeEngine();
    let control: ControlState = { holder: "shared", since: new Date().toISOString() };
    const { server, listen } = createHttpServer({
      port: 0,
      host: "127.0.0.1",
      clientDir: "/does-not-exist",
      activityBus: bus,
      getEngine: () => engine,
      getDevice: () => ({
        name: "TV",
        serial: "emulator-5554",
        profile: "tv",
        state: "running",
      }),
      getControlState: () => control,
      setControlState: (_id, holder, by, reason) => {
        control = { holder, since: new Date().toISOString(), by, reason };
        return control;
      },
    });
    await listen();
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: object, actor: string) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-porthole-actor": actor },
        body: JSON.stringify(body),
      });
    try {
      expect(
        (await post("/api/input", { kind: "remote", button: "dpad_right" }, "agent:mcp"))
          .status,
      ).toBe(200);
      const feed = (await (await fetch(base + "/api/activity")).json()) as {
        events: Array<{ actor: { kind: string }; action: string }>;
      };
      expect(feed.events[0]).toMatchObject({
        actor: { kind: "agent" },
        action: "remote",
      });
      expect(
        (await post("/api/control", { holder: "human" }, "human:browser")).status,
      ).toBe(200);
      const rejected = await post(
        "/api/input",
        { kind: "remote", button: "dpad_left" },
        "agent:mcp",
      );
      expect(rejected.status).toBe(423);
      expect(await rejected.json()).toMatchObject({
        code: "PAUSED_BY_HUMAN",
        retryable: true,
      });
      expect(
        (
          await post(
            "/api/input",
            { kind: "remote", button: "dpad_left" },
            "human:browser",
          )
        ).status,
      ).toBe(200);
      expect(engine.inputs).toHaveLength(2);
      expect(bus.since(0, 10).some((event) => event.outcome === "rejected")).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("lets an agent ask and a browser answer, and serves annotation crops", async () => {
    const engine = new FakeEngine();
    const { server, listen } = createHttpServer({
      port: 0,
      host: "127.0.0.1",
      clientDir: "/does-not-exist",
      getEngine: () => engine,
      getDevice: () => ({
        name: "Phone",
        serial: "emulator-5554",
        profile: "phone",
        state: "running",
      }),
    });
    await listen();
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: object, actor: string) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-porthole-actor": actor },
        body: JSON.stringify(body),
      });
    try {
      const asked = (await (
        await post(
          "/api/questions",
          { text: "Continue?", options: ["Yes"], timeoutMs: 1000 },
          "agent:mcp",
        )
      ).json()) as { id: string };
      const waiting = fetch(`${base}/api/questions/${asked.id}?wait=500`);
      const answered = (await (
        await post(`/api/questions/${asked.id}/answer`, { text: "Yes" }, "human:browser")
      ).json()) as { status: string };
      expect(answered.status).toBe("answered");
      expect((await waiting).status).toBe(200);
      const annotation = (await (
        await post(
          "/api/annotations",
          { rect: { x: 0, y: 0, w: 1, h: 1 }, note: "Clipped" },
          "human:browser",
        )
      ).json()) as { id: number };
      const crop = await fetch(`${base}/api/annotations/${annotation.id}/image`);
      expect(crop.headers.get("content-type")).toBe("image/png");
      expect((await crop.arrayBuffer()).byteLength).toBeGreaterThan(8);
      const dismissed = await fetch(`${base}/api/annotations/${annotation.id}`, {
        method: "DELETE",
      });
      expect(dismissed.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
