import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp/server.js";
import { createHttpServer } from "../server/http.js";
import { writeState } from "../state.js";
import { FakeEngine } from "./helpers/fake-engine.js";
import { ActivityBus } from "../activity.js";
import { QuestionStore } from "../questions.js";
import { AnnotationStore } from "../annotations.js";
import type { DeviceInfo } from "../device-manager.js";

const oldStateFile = process.env["PORTHOLE_STATE_FILE"];
const close: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(close.splice(0).map((fn) => fn()));
  if (oldStateFile === undefined) delete process.env["PORTHOLE_STATE_FILE"];
  else process.env["PORTHOLE_STATE_FILE"] = oldStateFile;
});

async function setup(profile: "phone" | "tv") {
  const dir = await mkdtemp(join(tmpdir(), "porthole-mcp-test-"));
  process.env["PORTHOLE_STATE_FILE"] = join(dir, "state.json");
  const engine = new FakeEngine();
  const activityBus = new ActivityBus();
  const questionStore = new QuestionStore(activityBus);
  const annotationStore = new AnnotationStore(activityBus);
  const device: DeviceInfo = {
    name: "Test_AVD",
    serial: "emulator-5554",
    profile,
    state: "running",
  };
  const { server: http, listen } = createHttpServer({
    port: 0,
    host: "127.0.0.1",
    clientDir: dir,
    getEngine: () => engine,
    getDevice: () => device,
    getDevices: () => [device],
    activityBus,
    questionStore,
    annotationStore,
  });
  const actorHeaders: string[] = [];
  http.on("request", (req) => {
    if (req.url?.startsWith("/api/input")) {
      const value = req.headers["x-porthole-actor"];
      if (typeof value === "string") actorHeaders.push(value);
    }
  });
  await listen();
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  await writeState({
    sessions: [
      {
        serial: "emulator-5554",
        avdName: device.name,
        profile,
        pid: process.pid,
        port: address.port,
        host: "127.0.0.1",
        url: `http://127.0.0.1:${address.port}`,
        startedAt: new Date().toISOString(),
        bootedByUs: false,
      },
    ],
  });
  const mcp = createMcpServer();
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await mcp.connect(a);
  await client.connect(b);
  close.push(async () => {
    await client.close();
    await mcp.close();
    await new Promise<void>((resolve) => (http as Server).close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });
  const attached = await client.callTool({
    name: "attach_device",
    arguments: { serial: device.serial },
  });
  expect(attached.isError).not.toBe(true);
  return { client, engine, actorHeaders, activityBus, questionStore, annotationStore };
}

describe("MCP session client", () => {
  it("shares phone input and screenshots with the live HTTP engine", async () => {
    const { client, engine, actorHeaders } = await setup("phone");
    expect(
      (await client.callTool({ name: "tap", arguments: { x: 0.2, y: 0.3 } })).isError,
    ).not.toBe(true);
    expect(
      (await client.callTool({ name: "remote", arguments: { button: "dpad_right" } }))
        .isError,
    ).not.toBe(true);
    expect(engine.inputs).toEqual([
      { kind: "touch", phase: "down", x: 0.2, y: 0.3 },
      { kind: "touch", phase: "up", x: 0.2, y: 0.3 },
      { kind: "remote", button: "dpad_right" },
    ]);
    expect(actorHeaders).toEqual(["agent:mcp", "agent:mcp", "agent:mcp"]);
    const shot = await client.callTool({ name: "screenshot", arguments: {} });
    expect(JSON.stringify(shot.content)).toContain('"type":"image"');
    const ui = await client.callTool({ name: "dump_ui", arguments: {} });
    expect(ui.isError).toBe(true);
  });

  it("rejects touch on a TV profile with a machine-readable error", async () => {
    const { client, engine } = await setup("tv");
    const result = await client.callTool({ name: "tap", arguments: { x: 0.5, y: 0.5 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("TOUCH_NOT_SUPPORTED");
    expect(engine.inputs).toEqual([]);
  });

  it("exposes activity, questions, and annotation crops", async () => {
    const { client, engine, activityBus, questionStore, annotationStore } =
      await setup("phone");
    await client.callTool({ name: "say", arguments: { message: "Checking a card" } });
    expect(activityBus.since(0, 10).some((event) => event.action === "note")).toBe(true);
    const activity = await client.callTool({
      name: "get_recent_activity",
      arguments: {},
    });
    expect(JSON.stringify(activity.content)).toContain("Checking a card");
    const control = await client.callTool({ name: "get_control_state", arguments: {} });
    expect(JSON.stringify(control.content)).toContain("shared");
    annotationStore.add(
      "emulator-5554",
      { kind: "human" },
      { x: 0, y: 0, w: 1, h: 1 },
      "border clipped",
      await engine.screenshot(),
    );
    const hinted = await client.callTool({ name: "get_control_state", arguments: {} });
    expect(JSON.stringify(hinted.content)).toContain("unread human notes");
    const notes = await client.callTool({
      name: "get_annotations",
      arguments: { includeImages: true },
    });
    expect(JSON.stringify(notes.content)).toContain('"type":"image"');
    const asking = client.callTool({
      name: "ask_human",
      arguments: { question: "Continue?", timeoutSeconds: 2 },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const open = questionStore.list("emulator-5554", "open")[0];
    if (!open) throw new Error("Question was not created");
    questionStore.answer(open.id, "Yes", { kind: "human" });
    const answered = await asking;
    expect(answered.structuredContent).toMatchObject({ answered: true, answer: "Yes" });
  });
});
