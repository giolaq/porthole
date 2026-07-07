import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");

await rm(resolve(packageRoot, "assets"), { recursive: true, force: true });
await rm(resolve(packageRoot, "client-dist"), { recursive: true, force: true });
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
