import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");

await mkdir(resolve(packageRoot, "assets"), { recursive: true });
await cp(
  resolve(workspaceRoot, "assets", "scrcpy-server"),
  resolve(packageRoot, "assets", "scrcpy-server"),
);

await cp(
  resolve(workspaceRoot, "packages", "porthole-client", "dist"),
  resolve(packageRoot, "client-dist"),
  { recursive: true },
);
