import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type DeviceProfile = "phone" | "tv";

export function detectProfileFromConfig(configContent: string): DeviceProfile {
  for (const line of configContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("tag.id")) {
      const value = trimmed.split("=")[1]?.trim();
      if (value === "android-tv" || value === "google-tv") {
        return "tv";
      }
    }
  }
  return "phone";
}

export async function detectProfile(avdPath: string): Promise<DeviceProfile> {
  try {
    const configPath = join(avdPath, "config.ini");
    const content = await readFile(configPath, "utf-8");
    return detectProfileFromConfig(content);
  } catch {
    return "phone";
  }
}
