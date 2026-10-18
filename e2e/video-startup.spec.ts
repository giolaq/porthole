import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { encodeVideoPacket } from "../packages/porthole/src/protocol.js";

// One red IDR frame, generated with ffmpeg's libx264 zerolatency preset.
// A static emulator may send no further frames after a browser connects.
const frame = readFileSync(new URL("./fixtures/red-frame.h264", import.meta.url));
// SPS and PPS precede the SEI NAL in this fixture.
const config = frame.subarray(0, frame.indexOf(Buffer.from([0, 0, 1, 6])));

test("static video survives late health dimensions", async ({ page }) => {
  let releaseHealth!: () => void;
  const healthReady = new Promise<void>((resolve) => {
    releaseHealth = resolve;
  });
  const device = { serial: "emulator-5554", name: "Video test", profile: "phone" };
  await page.route("**/health*", async (route) => {
    await healthReady;
    await route.fulfill({ json: { status: "ok", device, width: 64, height: 64 } });
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/devices": [device],
      "/api/activity": { events: [] },
      "/api/control": { holder: "shared" },
      "/api/questions": { questions: [] },
      "/api/annotations": { annotations: [] },
    };
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.routeWebSocket(/\/ws(?:\?|$)/, (ws) => {
    ws.send(Buffer.from(encodeVideoPacket({ type: "config", data: config })));
    ws.send(
      Buffer.from(encodeVideoPacket({ type: "frame", data: frame, keyframe: true })),
    );
  });
  await page.goto("/");
  const canvas = page.getByTestId("video-canvas");
  const redPixel = () =>
    canvas.evaluate((node) => {
      const c = node as HTMLCanvasElement;
      return c.getContext("2d")!.getImageData(0, 0, 1, 1).data[0];
    });
  try {
    await expect.poll(redPixel).toBeGreaterThan(200);
  } finally {
    releaseHealth();
  }
  await expect(canvas).toHaveAttribute("width", "64");
  await expect.poll(redPixel).toBeGreaterThan(200);
});
