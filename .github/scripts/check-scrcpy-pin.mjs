import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const scriptPath = "packages/porthole/scripts/download-scrcpy-server.mjs";
const source = await readFile(scriptPath, "utf8");
const currentVersion = matchConst(source, "SCRCPY_VERSION");
const currentSha = matchConst(source, "SCRCPY_SHA256");
const latest = await latestScrcpyRelease();

if (latest.version === currentVersion) {
  console.log(`scrcpy pin is current (${currentVersion}).`);
  await writeGithubOutput({ changed: "false", version: currentVersion });
  process.exit(0);
}

const assetUrl = `https://github.com/Genymobile/scrcpy/releases/download/v${latest.version}/scrcpy-server-v${latest.version}`;
const sha256 = await sha256Url(assetUrl);
const updated = source
  .replace(
    /export const SCRCPY_VERSION =\s*(?:\n\s*)?"[^"]+";/,
    `export const SCRCPY_VERSION = "${latest.version}";`,
  )
  .replace(
    /export const SCRCPY_SHA256 =\s*(?:\n\s*)?"[^"]+";/,
    `export const SCRCPY_SHA256 =\n  "${sha256}";`,
  );

// A silent no-op replacement would bump the version while keeping the old
// checksum — verify both landed before writing anything.
if (
  matchConst(updated, "SCRCPY_VERSION") !== latest.version ||
  matchConst(updated, "SCRCPY_SHA256") !== sha256
) {
  throw new Error("Pin replacement failed — download script layout changed?");
}

await writeFile(scriptPath, updated);
console.log(`scrcpy ${currentVersion} (${currentSha}) -> ${latest.version} (${sha256})`);
await writeGithubOutput({ changed: "true", version: latest.version, sha256 });

function matchConst(input, name) {
  const match = new RegExp(`export const ${name} =\\s*(?:\\n\\s*)?"([^"]+)";`).exec(
    input,
  );
  if (!match?.[1]) throw new Error(`Could not find ${name}`);
  return match[1];
}

async function latestScrcpyRelease() {
  const headers = { "User-Agent": "porthole-scrcpy-pin-check" };
  // Unauthenticated api.github.com is rate-limited per shared runner IP.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(
    "https://api.github.com/repos/Genymobile/scrcpy/releases/latest",
    { headers },
  );
  if (!response.ok) throw new Error(`GitHub release lookup failed: ${response.status}`);
  const body = await response.json();
  if (typeof body.tag_name !== "string" || !body.tag_name.startsWith("v")) {
    throw new Error("Latest scrcpy release did not include a v-prefixed tag.");
  }
  return { version: body.tag_name.slice(1) };
}

async function sha256Url(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { flag: "a" });
}
