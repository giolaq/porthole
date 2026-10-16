import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendSessionInput } from "../../control-client.js";
import { scrollGesture } from "../../gesture.js";
import { REMOTE_BUTTONS } from "../../protocol.js";
import type { SessionLink } from "../session-link.js";
import { guarded, ok } from "../result.js";

const coord = z.number().min(0).max(1);

export function register(server: McpServer, link: SessionLink): void {
  server.registerTool(
    "tap",
    {
      title: "Tap",
      description: "Touch at normalized 0..1 coordinates",
      inputSchema: { x: coord, y: coord },
    },
    async ({ x, y }) =>
      guarded(async () => {
        const opts = link.options();
        await sendSessionInput({ kind: "touch", phase: "down", x, y }, opts);
        await sendSessionInput({ kind: "touch", phase: "up", x, y }, opts);
        return ok(null, `Tapped at (${x}, ${y})`, false);
      }),
  );
  server.registerTool(
    "swipe",
    {
      title: "Swipe",
      description: "Swipe between normalized 0..1 coordinates on a phone profile",
      inputSchema: {
        x1: coord,
        y1: coord,
        x2: coord,
        y2: coord,
        durationMs: z.number().positive().optional(),
        steps: z.number().int().positive().optional(),
      },
    },
    async ({ x1, y1, x2, y2, durationMs, steps }) =>
      guarded(async () => {
        await sendSessionInput(
          { kind: "gesture", type: "swipe", x1, y1, x2, y2, durationMs, steps },
          link.options(),
        );
        return ok(null, "Swiped", false);
      }),
  );
  server.registerTool(
    "long_press",
    {
      title: "Long press",
      description: "Long-press normalized 0..1 phone coordinates",
      inputSchema: {
        x: coord,
        y: coord,
        durationMs: z.number().positive().optional(),
      },
    },
    async ({ x, y, durationMs }) =>
      guarded(async () => {
        await sendSessionInput(
          { kind: "gesture", type: "longpress", x1: x, y1: y, durationMs },
          link.options(),
        );
        return ok(null, "Long-pressed", false);
      }),
  );
  server.registerTool(
    "scroll",
    {
      title: "Scroll",
      description: "Scroll a phone screen by expanding to a centered swipe",
      inputSchema: {
        direction: z.enum(["up", "down", "left", "right"]),
        amount: coord.optional(),
        durationMs: z.number().positive().optional(),
      },
    },
    async ({ direction, amount, durationMs }) =>
      guarded(async () => {
        await sendSessionInput(
          scrollGesture(direction, amount, durationMs),
          link.options(),
        );
        return ok(null, `Scrolled ${direction}`, false);
      }),
  );
  server.registerTool(
    "key",
    {
      title: "Key",
      description: "Send a single Android keyevent",
      inputSchema: { keycode: z.number() },
    },
    async ({ keycode }) =>
      guarded(async () => {
        const opts = link.options();
        await sendSessionInput({ kind: "key", phase: "down", keycode }, opts);
        await sendSessionInput({ kind: "key", phase: "up", keycode }, opts);
        return ok(null, `Key ${keycode} sent`, false);
      }),
  );
  server.registerTool(
    "remote",
    {
      title: "Remote",
      description: "Press a TV remote button (D-pad, media, etc.)",
      inputSchema: { button: z.enum(REMOTE_BUTTONS) },
    },
    async ({ button }) =>
      guarded(async () => {
        await sendSessionInput({ kind: "remote", button }, link.options());
        return ok(null, `Remote: ${button}`, false);
      }),
  );
  server.registerTool(
    "type_text",
    {
      title: "Type text",
      description: "Type text on the device",
      inputSchema: { text: z.string() },
    },
    async ({ text }) =>
      guarded(async () => {
        await sendSessionInput({ kind: "text", text }, link.options());
        return ok(null, `Typed: "${text}"`, false);
      }),
  );
}
