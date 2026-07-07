import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Engine } from "./engine/types.js";
import { ScrcpyEngine } from "./engine/scrcpy-engine.js";
import { createHttpServer } from "./server/http.js";
import { createWsServer } from "./server/ws.js";
import type { DeviceInfo } from "./device-manager.js";
import type { InputEvent } from "./input.js";
import { removeSession, upsertSession } from "./state.js";
import { clientDistPath, scrcpyServerPath } from "./paths.js";
import { adbBin, findAndroidSdk } from "./device-manager.js";
import { AndroidKeycode } from "./keycodes.js";

const execFileAsync = promisify(execFile);

export interface SessionOptions {
  device: DeviceInfo;
  port: number;
  host: string;
  maxSize?: number;
  maxFps?: number;
  bitrate?: number;
  bootedByUs?: boolean;
  detached?: boolean;
  token?: string;
  forceMjpeg?: boolean;
}

export class Session {
  private engine: Engine | null = null;
  private server: Server | null = null;
  private attachEngine: ((engine: Engine) => void) | null = null;
  private restartAttempts = 0;
  private stopping = false;
  private status: "waiting" | "ok" | "reconnecting" | "dead" = "waiting";
  private readonly device: DeviceInfo;
  private readonly port: number;
  private readonly host: string;
  private readonly maxSize: number;
  private readonly maxFps: number;
  private readonly bitrate?: number;
  private readonly bootedByUs: boolean;
  private readonly detached: boolean;
  private readonly token?: string;
  private readonly forceMjpeg: boolean;

  constructor(opts: SessionOptions) {
    this.device = opts.device;
    this.port = opts.port;
    this.host = opts.host;
    this.maxSize = opts.maxSize ?? 1280;
    this.maxFps = opts.maxFps ?? 30;
    this.bitrate = opts.bitrate;
    this.bootedByUs = opts.bootedByUs ?? false;
    this.detached = opts.detached ?? false;
    this.token =
      opts.token ??
      (isLanHost(opts.host) ? randomBytes(18).toString("base64url") : undefined);
    this.forceMjpeg = opts.forceMjpeg ?? false;
  }

  async start(): Promise<{ url: string }> {
    if (!this.device.serial) {
      throw new Error("Device has no serial — is it running?");
    }
    const clientDir = clientDistPath();

    const { server, listen } = createHttpServer({
      port: this.port,
      host: this.host,
      clientDir,
      getEngine: () => this.engine,
      getDevice: () => this.device,
      handleInput: (event) => this.sendInput(event),
      token: this.token,
      forceMjpeg: this.forceMjpeg,
      getStatus: () => this.status,
    });
    this.server = server;

    const { attachEngine } = createWsServer({
      httpServer: server,
      getEngine: () => this.engine,
      getDevice: () => this.device,
      token: this.token,
    });
    this.attachEngine = attachEngine;

    await this.startEngine();
    await listen();

    const baseUrl = `http://${this.host}:${this.port}`;
    const url = this.token ? `${baseUrl}/?token=${this.token}` : baseUrl;
    await upsertSession({
      serial: this.device.serial,
      avdName: this.device.name,
      profile: this.device.profile,
      pid: process.pid,
      port: this.port,
      host: this.host,
      url,
      startedAt: new Date().toISOString(),
      bootedByUs: this.bootedByUs,
      detached: this.detached,
    });

    return { url };
  }

  private async startEngine(): Promise<void> {
    if (!this.device.serial) throw new Error("Device has no serial — is it running?");
    const engine = new ScrcpyEngine({
      serial: this.device.serial,
      maxSize: this.maxSize,
      maxFps: this.maxFps,
      bitrate: this.bitrate,
      serverPath: scrcpyServerPath(),
    });
    this.engine = engine;
    engine.onClose?.(() => {
      if (!this.stopping) void this.restartEngine();
    });
    await engine.start();
    this.status = "ok";
    this.restartAttempts = 0;
    this.attachEngine?.(engine);
  }

  private async restartEngine(): Promise<void> {
    if (this.restartAttempts >= 3) {
      this.status = "dead";
      return;
    }
    this.status = "reconnecting";
    this.restartAttempts++;
    const delay = 500 * 2 ** (this.restartAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await this.engine?.stop();
    } catch {
      // ignore
    }
    try {
      await this.startEngine();
    } catch {
      await this.restartEngine();
    }
  }

  async sendInput(event: InputEvent): Promise<void> {
    if (!this.engine) throw new Error("Session not started");
    if (this.device.profile === "tv") await this.ensureTvAwake();
    await this.engine.sendInput(event);
  }

  async screenshot(): Promise<Uint8Array> {
    if (!this.engine) throw new Error("Session not started");
    return this.engine.screenshot();
  }

  getEngine(): Engine | null {
    return this.engine;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }
    if (this.server) {
      const server = this.server;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.server = null;
    }
    await removeSession({ port: this.port, pid: process.pid });
  }

  private async ensureTvAwake(): Promise<void> {
    if (!this.device.serial) return;
    try {
      const adb = adbBin(findAndroidSdk());
      const { stdout } = await execFileAsync(adb, [
        "-s",
        this.device.serial,
        "shell",
        "dumpsys",
        "power",
      ]);
      if (/mWakefulness=(Asleep|Dozing)|Display Power:\s*state=OFF/.test(stdout)) {
        await this.engine?.sendInput({
          kind: "key",
          phase: "down",
          keycode: AndroidKeycode.KEYCODE_WAKEUP,
        });
        await this.engine?.sendInput({
          kind: "key",
          phase: "up",
          keycode: AndroidKeycode.KEYCODE_WAKEUP,
        });
      }
    } catch {
      // Do not block real input on dumpsys failures.
    }
  }
}

function isLanHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "";
}
