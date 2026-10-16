import { expect, test } from "@playwright/test";

test.skip(
  process.env.PORTHOLE_E2E !== "1",
  "Set PORTHOLE_E2E=1 with a live Porthole session.",
);

test("canvas paints non-black pixels", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByTestId("video-canvas");
  await expect(canvas).toBeVisible();
  // The first H.264 frame can take well beyond the default 5s poll on a
  // software-rendered CI emulator (same margin as the MJPEG test below).
  await expect
    .poll(
      async () =>
        canvas.evaluate((node) => {
          const canvasNode = node as HTMLCanvasElement;
          const ctx = canvasNode.getContext("2d");
          if (!ctx) return 0;
          const data = ctx.getImageData(0, 0, canvasNode.width, canvasNode.height).data;
          let nonBlack = 0;
          for (let i = 0; i < data.length; i += 4 * 997) {
            if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 15) {
              nonBlack++;
            }
          }
          return nonBlack;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
});

test("TV remote OK click sends a select websocket message", async ({ page }) => {
  const sentFrames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framesent", (event) => {
      if (typeof event.payload === "string") sentFrames.push(event.payload);
    });
  });

  await page.goto("/");
  const remoteSelect = page.getByTestId("remote-select");
  test.skip(
    !(await remoteSelect.isVisible().catch(() => false)),
    "TV remote is only visible for TV profiles.",
  );
  await remoteSelect.click();

  await expect
    .poll(() => sentFrames.some((frame) => frame.includes('"button":"select"')))
    .toBe(true);
});

test("MJPEG mode renders an image", async ({ page }) => {
  await page.goto("/?video=mjpeg");
  const image = page.getByTestId("mjpeg-stream");
  await expect(image).toBeVisible();
  // The first MJPEG frame needs a screencap plus a pure-JS PNG→JPEG
  // re-encode on a software-rendered CI emulator — well beyond the default
  // 5s poll (renders in ~6s locally, slower on CI).
  await expect
    .poll(
      () =>
        image.evaluate((node) => {
          const img = node as HTMLImageElement;
          return img.naturalWidth * img.naturalHeight;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
});

test("human and agent share activity, hand-off, and a question", async ({ page }) => {
  await page.goto("/");
  const health = (await (await page.request.get("/health")).json()) as {
    device?: { profile?: string };
  };
  const isTv = health.device?.profile === "tv";
  const agentHeaders = { "x-porthole-actor": "agent:test" };
  const agentInput = isTv
    ? { kind: "remote", button: "dpad_right" }
    : { kind: "touch", phase: "down", x: 0.5, y: 0.5 };
  await page.request.post("/api/input", { headers: agentHeaders, data: agentInput });
  if (!isTv) {
    await page.request.post("/api/input", {
      headers: agentHeaders,
      data: { kind: "touch", phase: "up", x: 0.5, y: 0.5 },
    });
  }
  await expect(
    page
      .getByTestId("activity-feed")
      .getByText(isTv ? "remote" : "tap")
      .first(),
  ).toBeVisible();
  if (isTv) {
    await expect(page.locator(".tv-remote")).toHaveAttribute(
      "data-ghost-button",
      "dpad_right",
    );
  } else {
    await expect(page.getByTestId("input-ghost")).toBeVisible();
  }
  await page.getByTestId("control-toggle").click();
  await expect(page.getByTestId("control-banner")).toBeVisible();
  const rejected = await page.request.post("/api/input", {
    headers: agentHeaders,
    data: agentInput,
  });
  expect(rejected.status()).toBe(423);
  await expect(page.getByText("Agent input paused while you have control")).toBeVisible();
  const question = (await (
    await page.request.post("/api/questions", {
      headers: agentHeaders,
      data: { text: "Continue from here?", options: ["Yes", "No"] },
    })
  ).json()) as { id: string };
  const waiting = page.request.get(`/api/questions/${question.id}?wait=30000`);
  await expect(page.getByTestId("question-banner")).toContainText("Continue from here?");
  await page.getByTestId("question-banner").getByText("Yes").click();
  const answer = (await (await waiting).json()) as {
    status: string;
    answer?: { text: string };
  };
  expect(answer.status).toBe("answered");
  expect(answer.answer?.text).toBe("Yes");
  await page.getByTestId("control-toggle").click();
  await expect(page.getByTestId("control-banner")).toBeHidden();
});
