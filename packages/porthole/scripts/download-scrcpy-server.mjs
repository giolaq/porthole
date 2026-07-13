// Downloads the pinned scrcpy-server jar from the official Genymobile/scrcpy
// GitHub release at install time. The jar is NOT committed to the repository
// or shipped in the npm tarball; this script is the single source of truth
// for the pinned version and its checksum.
//
// Bump process: update SCRCPY_VERSION and SCRCPY_SHA256 together, then verify
// the engine's AdbScrcpyOptions class in scrcpy-engine.ts matches the new
// server's protocol version.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRCPY_VERSION = "4.1";
export const SCRCPY_SHA256 =
  "deacb991ed2509715160ffdc7907e47b4160eb30d1566217e9047fd5b8850cae";
export const SCRCPY_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}`;

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const targetPath = join(packageRoot, "assets", "scrcpy-server");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function alreadyPresent() {
  if (!existsSync(targetPath)) return false;
  return sha256(await readFile(targetPath)) === SCRCPY_SHA256;
}

async function download() {
  const response = await fetch(SCRCPY_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${SCRCPY_URL}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== SCRCPY_SHA256) {
    throw new Error(
      `Checksum mismatch for scrcpy-server v${SCRCPY_VERSION}: expected ${SCRCPY_SHA256}, got ${digest}`,
    );
  }
  await mkdir(dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.download-${process.pid}`;
  await writeFile(tmpPath, bytes);
  await rename(tmpPath, targetPath);
}

try {
  if (await alreadyPresent()) {
    process.exit(0);
  }
  await download();
  console.log(`porthole: downloaded scrcpy-server v${SCRCPY_VERSION} (sha256 verified)`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `porthole: could not download scrcpy-server v${SCRCPY_VERSION}: ${message}\n` +
      `porthole: streaming will not work until it is fetched. Re-run:\n` +
      `porthole:   node ${join("scripts", "download-scrcpy-server.mjs")} (from the portholejs package directory)`,
  );
  // Do not fail `npm install` on offline machines; the CLI and doctor
  // report the missing asset with the same fix instructions at runtime.
  process.exit(0);
}
