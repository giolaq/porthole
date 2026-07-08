import { expect, test } from "@playwright/test";

test.skip(
  process.env.PORTHOLE_E2E !== "1",
  "Set PORTHOLE_E2E=1 with a live Porthole session.",
);

test("canvas paints non-black pixels", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByTestId("video-canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () =>
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
  await expect
    .poll(() =>
      image.evaluate((node) => {
        const img = node as HTMLImageElement;
        return img.naturalWidth * img.naturalHeight;
      }),
    )
    .toBeGreaterThan(0);
});
