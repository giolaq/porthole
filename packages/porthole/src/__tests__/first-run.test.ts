import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { isFirstRun, markWelcomeShown, welcomeText } from "../first-run.js";

let dir: string | null = null;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("first run", () => {
  it("is a first run until the welcome is marked shown", async () => {
    dir = await mkdtemp(join(tmpdir(), "porthole-first-run-test-"));
    const path = join(dir, "nested", "welcomed");
    expect(await isFirstRun(path)).toBe(true);
    await markWelcomeShown(path);
    expect(await isFirstRun(path)).toBe(false);
  });

  it("welcome text mentions the version and next steps", () => {
    const text = welcomeText("1.2.3");
    expect(text).toContain("Porthole 1.2.3 installed");
    expect(text).toContain("porthole --help");
    expect(text).toContain("https://github.com/giolaq/porthole");
  });
});
