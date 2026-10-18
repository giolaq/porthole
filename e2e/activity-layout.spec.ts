import { expect, test, type WebSocketRoute } from "@playwright/test";

for (const profile of ["phone", "tv"] as const) {
  test(`${profile}: activity scrolls without moving the emulator`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const device = { serial: "emulator-5554", name: "Layout test", profile };
    await page.route("**/health*", (route) =>
      route.fulfill({
        json: {
          status: "ok",
          device,
          width: profile === "phone" ? 1080 : 1920,
          height: profile === "phone" ? 1920 : 1080,
        },
      }),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const responses: Record<string, unknown> = {
        "/api/devices": [device],
        "/api/activity": { events: [] },
        "/api/control": { holder: "shared", since: new Date().toISOString() },
        "/api/questions": { questions: [] },
        "/api/annotations": { annotations: [] },
      };
      return route.fulfill({ json: responses[path] ?? {} });
    });
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/\/ws(?:\?|$)/, (ws) => {
      socket = ws;
    });

    await page.goto("/");
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`^\\[${profile}\\] \\d+x`))).toBeVisible();
    const feed = page.getByTestId("activity-feed");
    const canvas = page.getByTestId("video-canvas");
    await expect(feed.getByText("No activity yet.")).toBeVisible();
    const before = await canvas.boundingBox();
    expect(before).not.toBeNull();

    if (!socket) throw new Error("The preview websocket did not connect");
    for (let id = 1; id <= 200; id++) {
      socket.send(
        JSON.stringify({
          type: "activity",
          event: {
            id,
            ts: new Date().toISOString(),
            deviceId: device.serial,
            actor: { kind: "agent", name: "layout-test" },
            action: "note",
            params: { message: `Activity ${id}: checking the selected item` },
            outcome: "ok",
          },
        }),
      );
    }
    await expect(feed.getByTestId("activity-row")).toHaveCount(200);
    expect(await canvas.boundingBox()).toEqual(before);
    const bounds = await feed.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    expect(await feed.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(
      true,
    );
    await expect(feed.getByTestId("activity-row").last()).not.toBeInViewport();
    await feed.hover();
    await page.mouse.wheel(0, 50_000);
    await expect(feed.getByTestId("activity-row").last()).toBeInViewport();
    expect(await canvas.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);

    await page.setViewportSize({ width: 1440, height: 720 });
    const resized = await feed.boundingBox();
    expect(resized).not.toBeNull();
    expect(resized!.y + resized!.height).toBeLessThanOrEqual(720);
  });
}
