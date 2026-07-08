import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Single source of truth for the version is package.json (one directory above
// dist/ in both the workspace and the published package).
export const VERSION: string = (
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as { version: string }
).version;
