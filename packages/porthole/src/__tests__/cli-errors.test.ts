import { afterEach, describe, expect, it, vi } from "vitest";
import { runCliAction } from "../cli-errors.js";

describe("runCliAction", () => {
  const originalDebug = process.env["PORTHOLE_DEBUG"];

  afterEach(() => {
    if (originalDebug === undefined) delete process.env["PORTHOLE_DEBUG"];
    else process.env["PORTHOLE_DEBUG"] = originalDebug;
    vi.restoreAllMocks();
  });

  it("prints a concise stderr error", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as typeof process.exit);

    await expect(
      runCliAction({}, async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("exit");

    expect(stderr).toHaveBeenCalledWith("porthole: nope\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("prints JSON in quiet mode", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as typeof process.exit);

    await expect(
      runCliAction({ quiet: true }, async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("exit");

    expect(stderr).toHaveBeenCalledWith(JSON.stringify({ error: "nope" }) + "\n");
  });
});
