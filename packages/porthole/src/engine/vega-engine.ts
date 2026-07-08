import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, unlink } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Engine, EngineMetadata } from "./types.js";
import type { EngineInputEvent } from "../input.js";
import type { RemoteButton } from "../keycodes.js";

const execFileAsync = promisify(execFile);

// Fire TV remote buttons → QEMU qcodes. The mapping mirrors the VVD's own
// -keyboard-mapping (KEY_F1:KEY_HOMEPAGE, KEY_F4:KEY_PLAYPAUSE, ...).
const REMOTE_TO_QCODE: Record<RemoteButton, string> = {
  dpad_up: "up",
  dpad_down: "down",
  dpad_left: "left",
  dpad_right: "right",
  select: "ret",
  back: "esc",
  home: "f1",
  menu: "f2",
  rewind: "f3",
  play_pause: "f4",
  fast_forward: "f5",
  volume_up: "volumeup",
  volume_down: "volumedown",
};

const ANDROID_KEYCODE_TO_QCODE: Record<number, string> = {
  3: "f1", // HOME
  4: "esc", // BACK
  19: "up",
  20: "down",
  21: "left",
  22: "right",
  23: "ret", // DPAD_CENTER
  24: "volumeup",
  25: "volumedown",
  66: "ret", // ENTER
  82: "f2", // MENU
  85: "f4", // MEDIA_PLAY_PAUSE
  89: "f3", // MEDIA_REWIND
  90: "f5", // MEDIA_FAST_FORWARD
};

export interface VegaEngineOptions {
  consolePort?: number;
  qmpSocketPath?: string;
}

export class VegaEngine implements Engine {
  private _metadata: EngineMetadata | null = null;
  private closeCallbacks: Array<(error?: Error) => void> = [];
  private shotDir: string | null = null;
  private readonly consolePort: number;
  private readonly qmpSocketPath: string;

  constructor(opts: VegaEngineOptions = {}) {
    this.consolePort = opts.consolePort ?? 5554;
    this.qmpSocketPath =
      opts.qmpSocketPath ?? `/tmp/qmp-socket-${opts.consolePort ?? 5554}.sock`;
  }

  get metadata(): EngineMetadata | null {
    return this._metadata;
  }

  async start(): Promise<void> {
    this.shotDir = await mkdtemp(join(tmpdir(), "porthole-vega-"));
    const first = await this.screenshot();
    this._metadata = {
      codec: "mjpeg",
      width: pngWidth(first),
      height: pngHeight(first),
    };
  }

  // The Vega engine has no H.264 stream; video is served via the MJPEG
  // poller through captureFrame().
  onVideoChunk(): void {}

  onClose(cb: (error?: Error) => void): void {
    this.closeCallbacks.push(cb);
  }

  async sendInput(event: EngineInputEvent): Promise<void> {
    if (event.kind === "remote") {
      await this.qmpSendKey(REMOTE_TO_QCODE[event.button]);
      return;
    }
    if (event.kind === "key") {
      // QMP send-key emits a full press; only act on the down phase so the
      // client's down/up pairs do not double-press.
      if (event.phase !== "down") return;
      const qcode = ANDROID_KEYCODE_TO_QCODE[event.keycode];
      if (!qcode) {
        throw new Error(`No Vega key mapping for Android keycode ${event.keycode}`);
      }
      await this.qmpSendKey(qcode);
      return;
    }
    if (event.kind === "text") {
      for (const char of event.text) {
        const qcode = textQcode(char);
        if (qcode) await this.qmpSendKey(qcode);
      }
      return;
    }
    throw new Error("Touch input is not available for Vega devices.");
  }

  async screenshot(): Promise<Uint8Array> {
    if (!this.shotDir) throw new Error("Vega engine not started");
    await this.consoleCommand(`screenrecord screenshot ${this.shotDir}`);
    const file = await waitForPng(this.shotDir);
    const png = await readFile(file);
    await unlink(file).catch(() => undefined);
    return new Uint8Array(png);
  }

  async captureFrame(): Promise<{ data: Uint8Array; mime: string }> {
    return { data: await this.screenshot(), mime: "image/png" };
  }

  async stop(): Promise<void> {
    if (this.shotDir) {
      await rm(this.shotDir, { recursive: true, force: true });
      this.shotDir = null;
    }
    this._metadata = null;
    for (const cb of this.closeCallbacks) cb();
    this.closeCallbacks = [];
  }

  private async consoleCommand(command: string): Promise<void> {
    const token = await readFile(
      join(homedir(), ".emulator_console_auth_token"),
      "utf8",
    ).catch(() => "");
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(this.consolePort, "127.0.0.1");
      let buffer = "";
      let authed = token.trim().length === 0;
      let sent = false;
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(8000, () => fail(new Error("Vega console timed out")));
      socket.on("error", fail);
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        if (buffer.includes("KO:")) {
          fail(new Error(`Vega console rejected: ${buffer.split("KO:")[1]?.trim()}`));
          return;
        }
        const oks = buffer.split("\n").filter((line) => line.trim() === "OK").length;
        if (!authed && oks >= 1) {
          authed = true;
          socket.write(`auth ${token.trim()}\n`);
          return;
        }
        if (authed && !sent && oks >= (token.trim() ? 2 : 1)) {
          sent = true;
          socket.write(`${command}\n`);
          return;
        }
        if (sent && oks >= (token.trim() ? 3 : 2)) {
          socket.end();
          resolve();
        }
      });
    });
  }

  private async qmpSendKey(qcode: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket: Socket = createConnection(this.qmpSocketPath);
      let buffer = "";
      let step = 0;
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(5000, () => fail(new Error("QMP timed out")));
      socket.on("error", fail);
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        let index;
        while ((index = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          const message = JSON.parse(line) as {
            QMP?: unknown;
            return?: unknown;
            error?: { desc?: string };
          };
          if (message.error) {
            fail(new Error(`QMP error: ${message.error.desc ?? "unknown"}`));
            return;
          }
          if (message.QMP) {
            socket.write(JSON.stringify({ execute: "qmp_capabilities" }) + "\n");
            continue;
          }
          if (message.return !== undefined) {
            if (step === 0) {
              step = 1;
              socket.write(
                JSON.stringify({
                  execute: "send-key",
                  arguments: { keys: [{ type: "qcode", data: qcode }] },
                }) + "\n",
              );
            } else {
              socket.end();
              resolve();
            }
          }
        }
      });
    });
  }
}

export function isVegaConsoleUp(port = 5554): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(port, "127.0.0.1");
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
    socket.once("data", (chunk) => {
      const isEmulatorConsole = chunk.toString().includes("Android Console");
      socket.destroy();
      resolve(isEmulatorConsole);
    });
  });
}

export function resolveVegaCli(): string | null {
  if (process.env["PORTHOLE_VEGA_BIN"] && existsSync(process.env["PORTHOLE_VEGA_BIN"])) {
    return process.env["PORTHOLE_VEGA_BIN"];
  }
  const sdkRoot = join(homedir(), "vega", "sdk");
  if (!existsSync(sdkRoot)) return null;
  const versions = readdirSync(sdkRoot).sort().reverse();
  for (const version of versions) {
    const candidate = join(sdkRoot, version, "bin", "vega");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function ensureVegaVirtualDevice(): Promise<void> {
  if (await isVegaConsoleUp()) return;
  const cli = resolveVegaCli();
  if (!cli) {
    throw new Error(
      "Vega Virtual Device is not running and the vega CLI was not found. " +
        "Start it with `vega virtual-device start` or set PORTHOLE_VEGA_BIN.",
    );
  }
  await execFileAsync(cli, ["virtual-device", "start", "--no-gui", "--timeout", "240"], {
    timeout: 300_000,
  });
}

function pngWidth(png: Uint8Array): number {
  return readU32(png, 16);
}

function pngHeight(png: Uint8Array): number {
  return readU32(png, 20);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    (((data[offset] ?? 0) << 24) |
      ((data[offset + 1] ?? 0) << 16) |
      ((data[offset + 2] ?? 0) << 8) |
      (data[offset + 3] ?? 0)) >>>
    0
  );
}

async function waitForPng(dir: string): Promise<string> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const files = (await readdir(dir)).filter((name) => name.endsWith(".png"));
    if (files.length > 0) {
      const name = files.sort().at(-1);
      if (name) return join(dir, name);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vega console screenshot did not appear in time.");
}

function textQcode(char: string): string | null {
  if (/^[a-z0-9]$/.test(char)) return char;
  if (/^[A-Z]$/.test(char)) return char.toLowerCase();
  if (char === " ") return "spc";
  return null;
}
