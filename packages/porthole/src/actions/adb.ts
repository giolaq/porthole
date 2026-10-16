import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { adbBin, findAndroidSdk } from "../device-manager.js";
import { PortholeError } from "./errors.js";

const execFileAsync = promisify(execFile);

export async function adb(serial: string, args: string[], maxBuffer?: number) {
  try {
    return await execFileAsync(adbBin(findAndroidSdk()), ["-s", serial, ...args], {
      maxBuffer: maxBuffer ?? 1024 * 1024,
    });
  } catch (error) {
    throw new PortholeError(
      "ADB_FAILED",
      error instanceof Error ? error.message : String(error),
      400,
      true,
    );
  }
}
