import { join, resolve } from "node:path";
import type { Engine } from "./engine/types.js";
import { ScrcpyEngine } from "./engine/scrcpy-engine.js";
import { createHttpServer } from "./server/http.js";
import { createWsServer } from "./server/ws.js";
import type { DeviceInfo } from "./device-manager.js";
import type { InputEvent } from "./input.js";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");

export interface SessionOptions {
  device: DeviceInfo;
  port: number;
  host: string;
  maxSize?: number;
  maxFps?: number;
}

export class Session {
  private engine: Engine | null = null;
  private readonly device: DeviceInfo;
  private readonly port: number;
  private readonly host: string;
  private readonly maxSize: number;
  private readonly maxFps: number;

  constructor(opts: SessionOptions) {
    this.device = opts.device;
    this.port = opts.port;
    this.host = opts.host;
    this.maxSize = opts.maxSize ?? 1280;
    this.maxFps = opts.maxFps ?? 30;
  }

  async start(): Promise<{ url: string }> {
    if (!this.device.serial) {
      throw new Error("Device has no serial — is it running?");
    }

    this.engine = new ScrcpyEngine({
      serial: this.device.serial,
      maxSize: this.maxSize,
      maxFps: this.maxFps,
      serverPath: join(REPO_ROOT, "assets", "scrcpy-server"),
    });

    const clientDir = join(REPO_ROOT, "packages", "porthole-client", "dist");

    const { server, listen } = createHttpServer({
      port: this.port,
      host: this.host,
      clientDir,
      getEngine: () => this.engine,
    });

    const { attachEngine } = createWsServer({
      httpServer: server,
      getEngine: () => this.engine,
    });

    await this.engine.start();
    attachEngine(this.engine);
    await listen();

    return { url: `http://${this.host}:${this.port}` };
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
  }
}
