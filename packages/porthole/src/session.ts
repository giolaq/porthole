import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { Engine } from "./engine/types.js";
import { ScrcpyEngine } from "./engine/scrcpy-engine.js";
import { createHttpServer } from "./server/http.js";
import { createWsServer } from "./server/ws.js";
import type { DeviceInfo } from "./device-manager.js";
import type { InputEvent } from "./input.js";
import { removeSession, upsertSession } from "./state.js";
import { clientDistPath, scrcpyServerPath } from "./paths.js";

export interface SessionOptions {
  device: DeviceInfo;
  port: number;
  host: string;
  maxSize?: number;
  maxFps?: number;
  bootedByUs?: boolean;
  detached?: boolean;
  token?: string;
}

export class Session {
  private engine: Engine | null = null;
  private server: Server | null = null;
  private readonly device: DeviceInfo;
  private readonly port: number;
  private readonly host: string;
  private readonly maxSize: number;
  private readonly maxFps: number;
  private readonly bootedByUs: boolean;
  private readonly detached: boolean;
  private readonly token?: string;

  constructor(opts: SessionOptions) {
    this.device = opts.device;
    this.port = opts.port;
    this.host = opts.host;
    this.maxSize = opts.maxSize ?? 1280;
    this.maxFps = opts.maxFps ?? 30;
    this.bootedByUs = opts.bootedByUs ?? false;
    this.detached = opts.detached ?? false;
    this.token =
      opts.token ??
      (isLanHost(opts.host) ? randomBytes(18).toString("base64url") : undefined);
  }

  async start(): Promise<{ url: string }> {
    if (!this.device.serial) {
      throw new Error("Device has no serial — is it running?");
    }
    const serial = this.device.serial;

    this.engine = new ScrcpyEngine({
      serial,
      maxSize: this.maxSize,
      maxFps: this.maxFps,
      serverPath: scrcpyServerPath(),
    });

    const clientDir = clientDistPath();

    const { server, listen } = createHttpServer({
      port: this.port,
      host: this.host,
      clientDir,
      getEngine: () => this.engine,
      getDevice: () => this.device,
      handleInput: (event) => this.sendInput(event),
      token: this.token,
    });
    this.server = server;

    const { attachEngine } = createWsServer({
      httpServer: server,
      getEngine: () => this.engine,
      getDevice: () => this.device,
      token: this.token,
    });

    await this.engine.start();
    attachEngine(this.engine);
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

  async sendInput(event: InputEvent): Promise<void> {
    if (!this.engine) throw new Error("Session not started");
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
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }
    if (this.server) {
      const server = this.server;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.server = null;
    }
    if (!this.bootedByUs) {
      await removeSession({ port: this.port, pid: process.pid });
    }
  }
}

function isLanHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "";
}
