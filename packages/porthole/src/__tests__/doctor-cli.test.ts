import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "../cli/lifecycle.js";
import { runDoctor, type DoctorCheck } from "../doctor.js";

vi.mock("../doctor.js", () => ({ runDoctor: vi.fn() }));

const passingCheck = { name: "node", ok: true, detail: "Supported Node.js" };
const failingCheck = {
  name: "adb",
  ok: false,
  detail: "adb not found",
  fix: "Install Android SDK platform-tools.",
};

describe("doctor CLI", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it.each([
    { flags: [], checks: [passingCheck, failingCheck], expectedExitCode: 1 },
    { flags: ["-q"], checks: [passingCheck, failingCheck], expectedExitCode: 1 },
    { flags: [], checks: [passingCheck], expectedExitCode: 0 },
    { flags: ["--quiet"], checks: [passingCheck], expectedExitCode: 0 },
  ] satisfies { flags: string[]; checks: DoctorCheck[]; expectedExitCode: number }[])(
    "reports checks with flags $flags and exits $expectedExitCode",
    async ({ flags, checks, expectedExitCode }) => {
      vi.mocked(runDoctor).mockResolvedValue(checks);
      process.exitCode = 0;
      vi.spyOn(process, "exit").mockImplementation((code) => {
        process.exitCode = code ?? 0;
        return undefined as never;
      });
      const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = new Command();
      register(program);

      await program.parseAsync(["doctor", ...flags], { from: "user" });

      if (flags.length) {
        expect(JSON.parse(stdout.mock.calls.map(([chunk]) => chunk).join(""))).toEqual({
          checks,
        });
      } else {
        expect(log).toHaveBeenCalledWith("OK node: Supported Node.js");
        if (expectedExitCode) {
          expect(log).toHaveBeenCalledWith("FAIL adb: adb not found");
          expect(log).toHaveBeenCalledWith("  fix: Install Android SDK platform-tools.");
        }
      }
      expect(process.exitCode).toBe(expectedExitCode);
    },
  );
});
