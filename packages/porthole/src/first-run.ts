import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Lives in the home directory, not the tmpdir state file — the welcome
// should survive reboots and tmp cleanup so it only ever shows once.
export function firstRunMarkerPath(): string {
  return (
    process.env["PORTHOLE_FIRST_RUN_MARKER"] ?? join(homedir(), ".porthole", "welcomed")
  );
}

export async function isFirstRun(path = firstRunMarkerPath()): Promise<boolean> {
  try {
    await readFile(path);
    return false;
  } catch {
    return true;
  }
}

export async function markWelcomeShown(path = firstRunMarkerPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, new Date().toISOString() + "\n");
}

export function welcomeText(version: string): string {
  return [
    `Porthole ${version} installed — a window into your Android emulator.`,
    "",
    "Porthole streams a phone or TV AVD to your browser with full input",
    "control. Pick an AVD below and the preview opens automatically.",
    "",
    "Handy commands:",
    "  porthole list          list AVDs and running emulators",
    "  porthole screenshot    save a PNG of the running session",
    "  porthole kill          stop emulators Porthole booted",
    "  porthole --help        everything else (tap, swipe, remote, record, ...)",
    "",
    "Docs: https://github.com/giolaq/porthole",
    "",
  ].join("\n");
}
