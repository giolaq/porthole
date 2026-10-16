import type { Route } from "../router.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { adbBin, findAndroidSdk } from "../../device-manager.js";
import { parseCrashes } from "../../crashes.js";
import { sendJson, withSerial } from "../router.js";
const execFileAsync = promisify(execFile);

export const logsRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/logcat",
    handler: async (ctx) => {
      const { res, deviceId, url: parsedUrl } = ctx;
      const { getDevice } = ctx.opts;
      await withSerial(
        res,
        () => getDevice?.(deviceId),
        async (serial) => {
          const lines = parsedUrl.searchParams.get("lines") ?? "100";
          const filter = parsedUrl.searchParams.get("filter");
          const args = ["-s", serial, "logcat", "-d", "-t", lines];
          if (filter) args.push(filter);
          const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), args, {
            maxBuffer: 8 * 1024 * 1024,
          });
          await sendJson(res, 200, { ok: true, logcat: stdout });
        },
      );
      return;
    },
  },
  {
    method: "GET",
    path: "/api/crashes",
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
            "logcat",
            "-d",
            "-t",
            "1000",
          ]);
          await sendJson(res, 200, { ok: true, crashes: parseCrashes(stdout) });
        },
      );
      return;
    },
  },
];
