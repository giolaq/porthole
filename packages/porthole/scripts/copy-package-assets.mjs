import { cp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");

// The scrcpy-server jar is downloaded from the Genymobile/scrcpy release
// (not copied from the repo) — see download-scrcpy-server.mjs.
spawnSync(process.execPath, [join(here, "download-scrcpy-server.mjs")], {
  stdio: "inherit",
});

await rm(resolve(packageRoot, "client-dist"), { recursive: true, force: true });
await cp(
  resolve(workspaceRoot, "packages", "porthole-client", "dist"),
  resolve(packageRoot, "client-dist"),
  { recursive: true },
);

// npm reads README/LICENSE from the package directory, not the repo root —
// without these copies the npm page shows "This package does not have a README".
await cp(resolve(workspaceRoot, "README.md"), resolve(packageRoot, "README.md"));
await cp(resolve(workspaceRoot, "LICENSE"), resolve(packageRoot, "LICENSE"));

// Ship the agent skill so users can copy it into .claude/skills/ from
// node_modules (see README "Agent skill" section).
await rm(resolve(packageRoot, "skills"), { recursive: true, force: true });
await cp(resolve(workspaceRoot, "skills"), resolve(packageRoot, "skills"), {
  recursive: true,
});
