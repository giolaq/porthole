import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { writeFile, rm } from "node:fs/promises";
import {
  openUrl as adbOpenUrl,
  stopApp as adbStopApp,
  clearApp as adbClearApp,
} from "../adb-actions.js";
import type { ActionContext } from "./context.js";
import { actionDevice } from "./context.js";
import { adb } from "./adb.js";
import { PortholeError } from "./errors.js";
import { runAction } from "./run.js";

export async function openUrl(ctx: ActionContext, url: string): Promise<string> {
  return runAction(ctx, "open_url", { url }, () =>
    adbOpenUrl(actionDevice(ctx).serial, url),
  );
}
export async function stopApp(ctx: ActionContext, packageName: string): Promise<void> {
  await runAction(ctx, "stop_app", { packageName }, () =>
    adbStopApp(actionDevice(ctx).serial, packageName),
  );
}
export async function clearApp(ctx: ActionContext, packageName: string): Promise<void> {
  await runAction(ctx, "clear_app", { packageName }, () =>
    adbClearApp(actionDevice(ctx).serial, packageName),
  );
}
export async function listApps(ctx: ActionContext): Promise<string[]> {
  return runAction(ctx, "list_apps", undefined, async () => {
    const { stdout } = await adb(actionDevice(ctx).serial, [
      "shell",
      "pm",
      "list",
      "packages",
    ]);
    return stdout
      .split("\n")
      .map((line) => line.trim().replace(/^package:/, ""))
      .filter(Boolean);
  });
}
export async function launch(ctx: ActionContext, packageName: string): Promise<void> {
  await runAction(ctx, "launch", { packageName }, async () => {
    await adb(actionDevice(ctx).serial, ["shell", "monkey", "-p", packageName, "1"]);
  });
}

async function withTempFile(
  filename: string,
  data: Uint8Array,
  fn: (path: string) => Promise<unknown>,
) {
  const path = join(
    tmpdir(),
    `porthole-${process.pid}-${Date.now()}-${basename(filename)}`,
  );
  await writeFile(path, data);
  try {
    return await fn(path);
  } finally {
    await rm(path, { force: true });
  }
}

export async function installApk(ctx: ActionContext, filename: string, data: Uint8Array) {
  return runAction(ctx, "install_apk", { filename }, async () => {
    if (!filename.endsWith(".apk"))
      throw new PortholeError("BAD_REQUEST", "Only .apk files can be installed.", 400);
    return withTempFile(filename, data, (path) =>
      adb(actionDevice(ctx).serial, ["install", "-r", path]),
    );
  });
}

export async function pushFile(
  ctx: ActionContext,
  filename: string,
  data: Uint8Array,
): Promise<string> {
  return runAction(ctx, "push_file", { filename }, async () => {
    const remotePath = `/sdcard/Download/${basename(filename)}`;
    await withTempFile(filename, data, async (path) => {
      const serial = actionDevice(ctx).serial;
      await adb(serial, ["push", path, remotePath]);
      await adb(serial, [
        "shell",
        "am",
        "broadcast",
        "-a",
        "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d",
        `file://${remotePath}`,
      ]);
    });
    return remotePath;
  });
}
