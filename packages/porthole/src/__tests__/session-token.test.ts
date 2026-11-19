import { describe, expect, it } from "vitest";
import { Session } from "../session.js";

function previewToken(host: string, token?: string): string | undefined {
  const session = new Session({
    device: { name: "test", serial: "emulator-5554", profile: "phone", state: "running" },
    host,
    port: 3000,
    token,
  });

  return session["token"];
}

describe("preview bind token policy", () => {
  it.each([
    "127.0.0.1",
    "127.12.34.56",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "0:0:0:0:0:FFFF:7F12:3456",
  ])("does not generate a token for loopback %j", (host) => {
    expect(previewToken(host)).toBeUndefined();
  });

  it.each([
    "",
    "0.0.0.0",
    "::",
    "0:0:0:0:0:0:0:0",
    "192.168.1.10",
    "128.0.0.1",
    "fe80::1%en0",
    "2001:db8::1",
    "::ffff:192.168.1.10",
    "localhost",
    "LOCALHOST",
    "localhost.",
    "preview.example",
    "127.0.0.1.example",
    "127.0.0.999",
    "127.1",
    "::1.invalid",
  ])("generates a token for bind %j", (host) => {
    expect(previewToken(host)).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it.each(["127.0.0.1", "0.0.0.0", "192.168.1.10", "::", "preview.example"])(
    "preserves the supplied token for bind %j",
    (host) => {
      expect(previewToken(host, "explicit-preview-token")).toBe("explicit-preview-token");
    },
  );

  it("generates a token when an external bind is given an empty token", () => {
    expect(previewToken("0.0.0.0", "")).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });
});
