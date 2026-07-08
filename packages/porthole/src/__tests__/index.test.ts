import { describe, it, expect } from "vitest";
import { VERSION } from "../index.js";

describe("porthole", () => {
  it("exports the package.json version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(VERSION).not.toBe("0.0.1");
  });
});
