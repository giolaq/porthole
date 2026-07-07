import { describe, it, expect } from "vitest";

describe("MCP server module", () => {
  it("exports startMcpServer function", async () => {
    const mod = await import("../mcp/server.js");
    expect(typeof mod.startMcpServer).toBe("function");
  });
});
