import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, "../..");

export function scrcpyServerPath(): string {
  return firstExisting([
    resolve(PACKAGE_ROOT, "assets", "scrcpy-server"),
    resolve(WORKSPACE_ROOT, "assets", "scrcpy-server"),
  ]);
}

export function clientDistPath(): string {
  return firstExisting([
    resolve(PACKAGE_ROOT, "client-dist"),
    resolve(WORKSPACE_ROOT, "packages", "porthole-client", "dist"),
  ]);
}

function firstExisting(paths: string[]): string {
  return paths.find((path) => existsSync(path)) ?? paths[0] ?? "";
}
