import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { adbBin, findAndroidSdk } from "./device-manager.js";

const execFileAsync = promisify(execFile);

export async function openUrl(serial: string, url: string): Promise<string> {
  const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url,
  ]);
  return stdout;
}

export async function stopApp(serial: string, packageName: string): Promise<void> {
  await execFileAsync(adbBin(findAndroidSdk()), [
    "-s",
    serial,
    "shell",
    "am",
    "force-stop",
    packageName,
  ]);
}

export async function clearApp(serial: string, packageName: string): Promise<void> {
  await execFileAsync(adbBin(findAndroidSdk()), [
    "-s",
    serial,
    "shell",
    "pm",
    "clear",
    packageName,
  ]);
}
