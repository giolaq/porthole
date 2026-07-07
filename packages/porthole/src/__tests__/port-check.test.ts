import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { isPortFree, portInUseMessage } from "../port-check.js";

describe("isPortFree", () => {
  it("detects an occupied port", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    const port = typeof address === "object" && address ? address.port : 0;
    expect(await isPortFree(port, "127.0.0.1")).toBe(false);
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    expect(await isPortFree(port, "127.0.0.1")).toBe(true);
  });
});

describe("portInUseMessage", () => {
  it("names the owning Porthole session when known", () => {
    const message = portInUseMessage(3200, {
      serial: "emulator-5554",
      avdName: "Pixel_8_Pro_API_34",
      profile: "phone",
      pid: 123,
      port: 3200,
      host: "127.0.0.1",
      url: "http://127.0.0.1:3200",
      startedAt: "2026-07-07T00:00:00.000Z",
      bootedByUs: true,
    });
    expect(message).toContain("Pixel_8_Pro_API_34");
    expect(message).toContain("porthole kill");
  });

  it("falls back to a generic message", () => {
    expect(portInUseMessage(3200, undefined)).toContain("-p 3201");
  });
});
