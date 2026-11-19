import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runner = createRequire(import.meta.url).resolve("vite-node/vite-node.mjs");
const cli = fileURLToPath(new URL("../cli.ts", import.meta.url));

describe("Vega CLI startup", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "porthole-vega-cli-"));
  });

  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  function startVega(port: number) {
    const missingExecutable = join(workDir, "missing-vega.exe");
    const stateFile = join(workDir, "state.json");
    const result = spawnSync(
      process.execPath,
      [runner, cli, "start", "--vega", "--no-preview", "--quiet", "--port", String(port)],
      {
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          PORTHOLE_STATE_FILE: stateFile,
          PORTHOLE_VEGA_BIN: missingExecutable,
          TMPDIR: workDir,
          TMP: workDir,
          TEMP: workDir,
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("");
    expect(existsSync(stateFile)).toBe(false);
    return { result, missingExecutable };
  }

  it("fails with an actionable error when the Vega executable is missing", () => {
    // Port 0 asks the OS for a free port during the CLI's availability check.
    const { result, missingExecutable } = startVega(0);

    expect(result.stderr).toContain(`PORTHOLE_VEGA_BIN not found: ${missingExecutable}`);
    expect(result.status).not.toBe(0);
  }, 10_000);

  it("reports an occupied port before checking the Vega executable", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = blocker.address();
      if (!address || typeof address === "string") throw new Error("Missing TCP address");
      const { result } = startVega(address.port);

      expect(result.stderr).toContain(`Port ${address.port} is already in use`);
      expect(result.stderr).not.toContain("PORTHOLE_VEGA_BIN");
      expect(result.status).toBe(1);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  }, 10_000);
});
