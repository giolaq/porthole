import { describe, expect, it } from "vitest";
import { parseCrashes } from "../crashes.js";

describe("parseCrashes", () => {
  it("extracts fatal exception records", () => {
    const crashes =
      parseCrashes(`07-07 12:00:00.000 E AndroidRuntime: FATAL EXCEPTION: main
07-07 12:00:00.001 E AndroidRuntime: Process: com.example, PID: 123
07-07 12:00:00.002 E AndroidRuntime: java.lang.RuntimeException: boom
`);
    expect(crashes).toHaveLength(1);
    expect(crashes[0]?.process).toBe("com.example");
    expect(crashes[0]?.summary).toContain("RuntimeException");
  });
});
