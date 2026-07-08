import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, normalize, relative } from "node:path";
import { promisify } from "node:util";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { adbBin, findAndroidSdk, listDevices } from "../device-manager.js";
import type { Engine } from "../engine/types.js";
import type { InputEvent } from "../input.js";
import { assertInputAllowed, parseInputEvent } from "../input-validation.js";
import { sendGesture } from "../gesture.js";
import type { DeviceInfo } from "../device-manager.js";
import { readState } from "../state.js";
import { MjpegPoller } from "./mjpeg.js";
import { clearApp, openUrl, stopApp } from "../adb-actions.js";
import { parseCrashes } from "../crashes.js";
import { dumpUi, findElement, getFocusedNode, waitForUiText } from "../ui-tree.js";
import { focusOn } from "../focus-navigation.js";

const execFileAsync = promisify(execFile);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export interface HttpServerOptions {
  port: number;
  host: string;
  clientDir: string;
  getEngine: () => Engine | null;
  getDevice?: () => DeviceInfo;
  handleInput?: (event: InputEvent) => Promise<void>;
  token?: string;
  forceMjpeg?: boolean;
  getStatus?: () => "waiting" | "ok" | "reconnecting" | "dead";
}

export function createHttpServer(opts: HttpServerOptions) {
  const {
    port,
    host,
    clientDir,
    getEngine,
    getDevice,
    handleInput,
    token,
    forceMjpeg,
    getStatus,
  } = opts;
  const mjpegPoller = new MjpegPoller(getEngine);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
    const url = parsedUrl.pathname;
    const authorized = isAuthorized(req, parsedUrl, token);
    if (!authorized) {
      await sendJson(res, 401, { ok: false, error: "Porthole token required." });
      return;
    }

    const tokenFromQuery = parsedUrl.searchParams.get("token");
    if (token && tokenFromQuery === token) {
      res.setHeader("Set-Cookie", `porthole_token=${token}; Path=/; SameSite=Lax`);
    }

    if (url === "/health") {
      const engine = getEngine();
      if (engine?.metadata) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: getStatus?.() ?? "ok",
            device: getDevice?.(),
            videoModes: ["webcodecs", "mjpeg"],
            preferredVideoMode: forceMjpeg ? "mjpeg" : "webcodecs",
            ...engine.metadata,
          }),
        );
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: getStatus?.() ?? "waiting" }));
      }
      return;
    }

    if (url === "/stream.mjpeg" && req.method === "GET") {
      const engine = getEngine();
      if (!engine) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("No engine");
        return;
      }
      mjpegPoller.addClient(res);
      return;
    }

    if (url === "/screenshot") {
      const engine = getEngine();
      if (!engine) {
        res.writeHead(503);
        res.end("No engine");
        return;
      }
      try {
        const png = await engine.screenshot();
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": png.byteLength.toString(),
        });
        res.end(png);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
      return;
    }

    if (url === "/api/devices" && req.method === "GET") {
      await sendJson(res, 200, await listDevices());
      return;
    }

    if (url === "/api/state" && req.method === "GET") {
      await sendJson(res, 200, {
        device: getDevice?.() ?? null,
        engine: getEngine()?.metadata ?? null,
        state: await readState(),
      });
      return;
    }

    if (url === "/api/input" && req.method === "POST") {
      const device = getDevice?.();
      if (!device) {
        await sendJson(res, 503, { ok: false, error: "No active device." });
        return;
      }
      try {
        const event = parseInputEvent(await readJson(req));
        assertInputAllowed(device.profile, event);
        const engine = getEngine();
        if (!handleInput && !engine) {
          throw new Error("No active engine.");
        }
        if (handleInput) {
          await handleInput(event);
        } else if (event.kind === "gesture") {
          if (!engine) throw new Error("No active engine.");
          await sendGesture(event, (touch) => engine.sendInput(touch));
        } else {
          await engine?.sendInput(event);
        }
        await sendJson(res, 200, { ok: true });
      } catch (error) {
        await sendJson(res, 400, { ok: false, error: errorMessage(error) });
      }
      return;
    }

    if (url === "/api/logcat" && req.method === "GET") {
      await withSerial(res, getDevice, async (serial) => {
        const lines = parsedUrl.searchParams.get("lines") ?? "100";
        const filter = parsedUrl.searchParams.get("filter");
        const args = ["-s", serial, "logcat", "-d", "-t", lines];
        if (filter) args.push(filter);
        const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), args, {
          maxBuffer: 8 * 1024 * 1024,
        });
        await sendJson(res, 200, { ok: true, logcat: stdout });
      });
      return;
    }

    if (url === "/api/crashes" && req.method === "GET") {
      await withSerial(res, getDevice, async (serial) => {
        const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), [
          "-s",
          serial,
          "logcat",
          "-d",
          "-t",
          "1000",
        ]);
        await sendJson(res, 200, { ok: true, crashes: parseCrashes(stdout) });
      });
      return;
    }

    if (url === "/api/ui" && req.method === "GET") {
      await withSerial(res, getDevice, async (serial) => {
        await sendJson(res, 200, {
          ok: true,
          tree: await dumpUi(serial, parsedUrl.searchParams.get("filter") ?? undefined),
        });
      });
      return;
    }

    if (url === "/api/focused" && req.method === "GET") {
      await withSerial(res, getDevice, async (serial) => {
        await sendJson(res, 200, { ok: true, node: await getFocusedNode(serial) });
      });
      return;
    }

    if (url === "/api/focus_on" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        const text = typeof body.text === "string" ? body.text : undefined;
        const resourceId =
          typeof body.resourceId === "string" ? body.resourceId : undefined;
        const contentDesc =
          typeof body.contentDesc === "string" ? body.contentDesc : undefined;
        if (!text && !resourceId && !contentDesc) {
          throw new Error("text, resourceId, or contentDesc is required.");
        }
        const maxSteps =
          typeof body.maxSteps === "number" && Number.isInteger(body.maxSteps)
            ? body.maxSteps
            : undefined;
        const result = await focusOn(
          serial,
          { text, resourceId, contentDesc },
          async (button) => {
            const event = { kind: "remote" as const, button };
            if (handleInput) await handleInput(event);
            else await getEngine()?.sendInput(event);
          },
          { select: body.select === true, maxSteps },
        );
        await sendJson(res, 200, { ok: true, result });
      });
      return;
    }

    if (url === "/api/find" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial, device) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        const text = typeof body.text === "string" ? body.text : undefined;
        const resourceId =
          typeof body.resourceId === "string" ? body.resourceId : undefined;
        if (!text && !resourceId) {
          throw new Error("text or resourceId is required.");
        }
        const node = await findElement(serial, { text, resourceId });
        if (node && body.tap === true && device.profile === "phone") {
          if (!node.normalizedCenter) {
            throw new Error("Could not determine display size from the UI dump.");
          }
          const engine = getEngine();
          await engine?.sendInput({
            kind: "touch",
            phase: "down",
            ...node.normalizedCenter,
          });
          await engine?.sendInput({
            kind: "touch",
            phase: "up",
            ...node.normalizedCenter,
          });
        }
        await sendJson(res, 200, { ok: true, node });
      });
      return;
    }

    if (url === "/api/wait_for" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (typeof body.text !== "string") throw new Error("text is required.");
        const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : 10_000;
        await sendJson(res, 200, {
          ok: true,
          node: await waitForUiText(serial, body.text, timeoutMs),
        });
      });
      return;
    }

    if (url === "/api/open_url" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (typeof body.url !== "string") throw new Error("url is required.");
        await sendJson(res, 200, {
          ok: true,
          stdout: await openUrl(serial, body.url),
        });
      });
      return;
    }

    if (url === "/api/stop_app" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (typeof body.packageName !== "string") {
          throw new Error("packageName is required.");
        }
        await stopApp(serial, body.packageName);
        await sendJson(res, 200, { ok: true });
      });
      return;
    }

    if (url === "/api/clear_app" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (typeof body.packageName !== "string") {
          throw new Error("packageName is required.");
        }
        await clearApp(serial, body.packageName);
        await sendJson(res, 200, { ok: true });
      });
      return;
    }

    if (url === "/api/apps" && req.method === "GET") {
      await withSerial(res, getDevice, async (serial) => {
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
      });
      return;
    }

    if (url === "/api/launch" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
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
      });
      return;
    }

    if (url === "/api/rotate" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial, device) => {
        if (device.profile === "tv") {
          throw new Error("Rotation controls are only available for phone profiles.");
        }
        const body = (await readJson(req)) as Record<string, unknown>;
        const orientation = String(body.orientation ?? "");
        const rotation = rotationValue(orientation);
        const adb = adbBin(findAndroidSdk());
        await execFileAsync(adb, [
          "-s",
          serial,
          "shell",
          "settings",
          "put",
          "system",
          "accelerometer_rotation",
          "0",
        ]);
        await execFileAsync(adb, [
          "-s",
          serial,
          "shell",
          "settings",
          "put",
          "system",
          "user_rotation",
          String(rotation),
        ]);
        await sendJson(res, 200, { ok: true, rotation });
      });
      return;
    }

    if (url === "/api/emu" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (
          !Array.isArray(body.args) ||
          !body.args.every((arg) => typeof arg === "string")
        ) {
          throw new Error("args must be an array of strings.");
        }
        const { stdout } = await execFileAsync(adbBin(findAndroidSdk()), [
          "-s",
          serial,
          "emu",
          ...body.args,
        ]);
        await sendJson(res, 200, { ok: true, stdout });
      });
      return;
    }

    if (url === "/api/install" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
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
      });
      return;
    }

    if (url === "/api/push" && req.method === "POST") {
      await withSerial(res, getDevice, async (serial) => {
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
      });
      return;
    }

    await serveStatic(clientDir, url, res);
  });

  return {
    server,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      }),
  };
}

async function serveStatic(
  clientDir: string,
  url: string,
  res: ServerResponse,
): Promise<void> {
  let filePath = join(clientDir, url === "/" ? "index.html" : url);
  const normalized = normalize(filePath);
  if (relative(clientDir, normalized).startsWith("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  filePath = normalized;

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = filePath.substring(filePath.lastIndexOf("."));
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readText(req);
  return JSON.parse(raw);
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): Promise<void> {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function withSerial(
  res: ServerResponse,
  getDevice: (() => DeviceInfo) | undefined,
  handler: (serial: string, device: DeviceInfo) => Promise<void>,
): Promise<void> {
  const device = getDevice?.();
  if (!device?.serial) {
    await sendJson(res, 503, { ok: false, error: "No active device." });
    return;
  }
  try {
    await handler(device.serial, device);
  } catch (error) {
    await sendJson(res, 400, { ok: false, error: errorMessage(error) });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeFilename(value: string | string[]): string {
  return basename(Array.isArray(value) ? (value[0] ?? "porthole-drop") : value);
}

function rotationValue(orientation: string): number {
  switch (orientation) {
    case "portrait":
      return 0;
    case "landscape":
    case "right":
      return 1;
    case "left":
      return 3;
    default:
      throw new Error("orientation must be portrait, landscape, left, or right.");
  }
}

function isAuthorized(
  req: IncomingMessage,
  url: URL,
  token: string | undefined,
): boolean {
  if (!token) return true;
  if (isLocalAddress(req.socket.remoteAddress)) return true;
  if (url.searchParams.get("token") === token) return true;
  return parseCookie(req.headers.cookie ?? "").get("porthole_token") === token;
}

function isLocalAddress(address: string | undefined): boolean {
  // Fail closed: no discernible peer address means no token bypass.
  if (!address) return false;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function parseCookie(cookie: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key && value) values.set(key, value);
  }
  return values;
}
