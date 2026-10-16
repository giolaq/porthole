import type { Route } from "../router.js";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { writeFile, rm } from "node:fs/promises";
import { adbBin, findAndroidSdk } from "../../device-manager.js";
import { clearApp, openUrl, stopApp } from "../../adb-actions.js";
import {
  readJson,
  readBytes,
  sendJson,
  sanitizeFilename,
  withSerial,
} from "../router.js";
const execFileAsync = promisify(execFile);

export const appsRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/open_url",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          if (typeof body.url !== "string") throw new Error("url is required.");
          await sendJson(res, 200, {
            ok: true,
            stdout: await openUrl(serial, body.url),
          });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/stop_app",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          if (typeof body.packageName !== "string") {
            throw new Error("packageName is required.");
          }
          await stopApp(serial, body.packageName);
          await sendJson(res, 200, { ok: true });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/clear_app",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          if (typeof body.packageName !== "string") {
            throw new Error("packageName is required.");
          }
          await clearApp(serial, body.packageName);
          await sendJson(res, 200, { ok: true });
        },
      );
      return;
    },
  },
  {
    method: "GET",
    path: "/api/apps",
    handler: async (ctx) => {
      const { res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), [
            "-s",
            serial,
            "shell",
            "pm",
            "list",
            "packages",
          ]);
          const packages = stdout
            .split("\n")
            .map((line) => line.trim().replace(/^package:/, ""))
            .filter(Boolean);
          await sendJson(res, 200, { ok: true, packages });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/launch",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const body = (await readJson(req)) as Record<string, unknown>;
          if (typeof body.packageName !== "string") {
            throw new Error("packageName is required.");
          }
          await execFileAsync(adbBin(findAndroidSdk()), [
            "-s",
            serial,
            "shell",
            "monkey",
            "-p",
            body.packageName,
            "1",
          ]);
          await sendJson(res, 200, { ok: true });
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/install",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const filename = sanitizeFilename(
            req.headers["x-porthole-filename"] ?? "drop.apk",
          );
          if (!filename.endsWith(".apk")) {
            throw new Error("Only .apk files can be installed.");
          }
          const file = await readBytes(req);
          const tmpPath = join(
            tmpdir(),
            `porthole-${process.pid}-${Date.now()}-${filename}`,
          );
          await writeFile(tmpPath, file);
          try {
            const { stdout, stderr } = await execFileAsync(adbBin(findAndroidSdk()), [
              "-s",
              serial,
              "install",
              "-r",
              tmpPath,
            ]);
            await sendJson(res, 200, { ok: true, stdout, stderr });
          } finally {
            await rm(tmpPath, { force: true });
          }
        },
      );
      return;
    },
  },
  {
    method: "POST",
    path: "/api/push",
    handler: async (ctx) => {
      const { req, res, deviceId } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const filename = sanitizeFilename(
            req.headers["x-porthole-filename"] ?? "porthole-drop",
          );
          const file = await readBytes(req);
          const tmpPath = join(
            tmpdir(),
            `porthole-${process.pid}-${Date.now()}-${filename}`,
          );
          const remotePath = `/sdcard/Download/${filename}`;
          const adb = adbBin(findAndroidSdk());
          await writeFile(tmpPath, file);
          try {
            await execFileAsync(adb, ["-s", serial, "push", tmpPath, remotePath]);
            await execFileAsync(adb, [
              "-s",
              serial,
              "shell",
              "am",
              "broadcast",
              "-a",
              "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
              "-d",
              `file://${remotePath}`,
            ]);
            await sendJson(res, 200, { ok: true, path: remotePath });
          } finally {
            await rm(tmpPath, { force: true });
          }
        },
      );
      return;
    },
  },
];
