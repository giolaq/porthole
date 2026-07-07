import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, "../..");

export const SCRCPY_DOWNLOAD_SCRIPT = resolve(
  PACKAGE_ROOT,
  "scripts",
  "download-scrcpy-server.mjs",
);

export function scrcpyServerCandidatePath(): string {
  return resolve(PACKAGE_ROOT, "assets", "scrcpy-server");
}

export function scrcpyServerPath(): string {
  const path = scrcpyServerCandidatePath();
  if (!existsSync(path)) {
    throw new Error(
      `scrcpy-server not found at ${path}. It is downloaded from the ` +
        `Genymobile/scrcpy GitHub release at install time. Fetch it with:\n` +
        `  node ${SCRCPY_DOWNLOAD_SCRIPT}`,
    );
  }
  return path;
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
