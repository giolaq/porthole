import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Engine } from "./engine/types.js";
import { ScrcpyEngine } from "./engine/scrcpy-engine.js";
import { VegaEngine } from "./engine/vega-engine.js";
import { createHttpServer } from "./server/http.js";
import { createWsServer } from "./server/ws.js";
import type { DeviceInfo } from "./device-manager.js";
import type { InputEvent } from "./input.js";
import { sendGesture } from "./gesture.js";
import { removeSession, upsertSession } from "./state.js";
import { clientDistPath, scrcpyServerPath } from "./paths.js";
import { adbBin, findAndroidSdk } from "./device-manager.js";
import { AndroidKeycode } from "./keycodes.js";

const execFileAsync = promisify(execFile);

export interface SessionOptions {
  device?: DeviceInfo;
  devices?: SessionDeviceOptions[];
  port: number;
  host: string;
  maxSize?: number;
  maxFps?: number;
  bitrate?: number;
  bootedByUs?: boolean;
  detached?: boolean;
  token?: string;
  forceMjpeg?: boolean;
  engineKind?: "scrcpy" | "vega";
}

export interface SessionDeviceOptions {
  device: DeviceInfo;
  bootedByUs?: boolean;
}

interface DeviceRuntime {
  device: DeviceInfo;
  engine: Engine | null;
  restartAttempts: number;
  stopping: boolean;
  status: "waiting" | "ok" | "reconnecting" | "dead";
  bootedByUs: boolean;
}

export class Session {
  private server: Server | null = null;
  private attachEngine: ((deviceId: string, engine: Engine) => void) | null = null;
  private readonly runtimes = new Map<string, DeviceRuntime>();
  private readonly defaultSerial: string;
  private readonly port: number;
  private readonly host: string;
  private readonly maxSize: number;
  private readonly maxFps: number;
  private readonly bitrate?: number;
  private readonly detached: boolean;
  private readonly token?: string;
  private readonly forceMjpeg: boolean;
  private readonly engineKind: "scrcpy" | "vega";

  constructor(opts: SessionOptions) {
    const devices = opts.devices ?? (opts.device ? [{ device: opts.device }] : []);
    if (devices.length === 0) {
      throw new Error("At least one device is required.");
    }
    for (const entry of devices) {
      if (!entry.device.serial) {
        throw new Error(`Device ${entry.device.name} has no serial — is it running?`);
      }
      this.runtimes.set(entry.device.serial, {
        device: entry.device,
        engine: null,
        restartAttempts: 0,
        stopping: false,
        status: "waiting",
        bootedByUs: entry.bootedByUs ?? opts.bootedByUs ?? false,
      });
    }
    const first = devices[0]?.device.serial;
    if (!first) throw new Error("At least one running device is required.");
    this.defaultSerial = first;
    this.port = opts.port;
    this.host = opts.host;
    this.maxSize = opts.maxSize ?? 1280;
    this.maxFps = opts.maxFps ?? 30;
    this.bitrate = opts.bitrate;
    this.detached = opts.detached ?? false;
    this.token =
      opts.token ??
      (isLanHost(opts.host) ? randomBytes(18).toString("base64url") : undefined);
    this.forceMjpeg = opts.forceMjpeg ?? false;
    this.engineKind = opts.engineKind ?? "scrcpy";
  }

  async start(): Promise<{ url: string }> {
    const clientDir = clientDistPath();

    const { server, listen } = createHttpServer({
      port: this.port,
      host: this.host,
      clientDir,
      getEngine: (deviceId) => this.getEngine(deviceId),
      getDevice: (deviceId) => this.getDevice(deviceId),
      getDevices: () => this.getDevices(),
      handleInput: (event, deviceId) => this.sendInput(event, deviceId),
      token: this.token,
      forceMjpeg: this.forceMjpeg,
      getStatus: (deviceId) => this.getStatus(deviceId),
    });
    this.server = server;

    const { attachEngine } = createWsServer({
      httpServer: server,
      getEngine: (deviceId) => this.getEngine(deviceId),
      getDevice: (deviceId) => this.getDevice(deviceId),
      getDefaultDeviceId: () => this.defaultSerial,
      token: this.token,
    });
    this.attachEngine = attachEngine;

    await Promise.all(
      [...this.runtimes.values()].map((runtime) => this.startEngine(runtime)),
    );
    await listen();

    const baseUrl = `http://${this.host}:${this.port}`;
    const url = this.token ? `${baseUrl}/?token=${this.token}` : baseUrl;
    const startedAt = new Date().toISOString();
    for (const runtime of this.runtimes.values()) {
      if (!runtime.device.serial) continue;
      await upsertSession({
        serial: runtime.device.serial,
        avdName: runtime.device.name,
        profile: runtime.device.profile,
        pid: process.pid,
        port: this.port,
        host: this.host,
        url,
        startedAt,
        bootedByUs: runtime.bootedByUs,
        detached: this.detached,
      });
    }

    return { url };
  }

  private async startEngine(runtime: DeviceRuntime): Promise<void> {
    if (!runtime.device.serial) {
      throw new Error("Device has no serial — is it running?");
    }
    const engine: Engine =
      this.engineKind === "vega"
        ? new VegaEngine()
        : new ScrcpyEngine({
            serial: runtime.device.serial,
            maxSize: this.maxSize,
            maxFps: this.maxFps,
            bitrate: this.bitrate,
            serverPath: scrcpyServerPath(),
          });
    runtime.engine = engine;
    engine.onClose?.(() => {
      if (!runtime.stopping) void this.restartEngine(runtime);
    });
    await engine.start();
    runtime.status = "ok";
    runtime.restartAttempts = 0;
    this.attachEngine?.(runtime.device.serial, engine);
  }

  private async restartEngine(runtime: DeviceRuntime): Promise<void> {
    if (runtime.restartAttempts >= 3) {
      runtime.status = "dead";
      return;
    }
    runtime.status = "reconnecting";
    runtime.restartAttempts++;
    const delay = 500 * 2 ** (runtime.restartAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await runtime.engine?.stop();
    } catch {
      // ignore
    }
    try {
      await this.startEngine(runtime);
    } catch {
      await this.restartEngine(runtime);
    }
  }

  async sendInput(event: InputEvent, deviceId?: string): Promise<void> {
    const runtime = this.getRuntime(deviceId);
    const engine = runtime.engine;
    if (!engine) throw new Error("Session not started");
    // TV auto-wake uses adb dumpsys, which does not exist on Vega guests.
    if (runtime.device.profile === "tv" && this.engineKind === "scrcpy") {
      await this.ensureTvAwake(runtime);
    }
    if (event.kind === "gesture") {
      await sendGesture(event, (touch) => engine.sendInput(touch));
      return;
    }
    await engine.sendInput(event);
  }

  async screenshot(deviceId?: string): Promise<Uint8Array> {
    const engine = this.getRuntime(deviceId).engine;
    if (!engine) throw new Error("Session not started");
    return engine.screenshot();
  }

  getEngine(deviceId?: string): Engine | null {
    return this.findRuntime(deviceId)?.engine ?? null;
  }

  getDevice(deviceId?: string): DeviceInfo | undefined {
    return this.findRuntime(deviceId)?.device;
  }

  getDevices(): DeviceInfo[] {
    return [...this.runtimes.values()].map((runtime) => runtime.device);
  }

  getStatus(deviceId?: string): DeviceRuntime["status"] {
    return this.findRuntime(deviceId)?.status ?? "dead";
  }

  async stop(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      runtime.stopping = true;
      if (runtime.engine) {
        await runtime.engine.stop();
        runtime.engine = null;
      }
    }
    if (this.server) {
      const server = this.server;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.server = null;
    }
    await removeSession({ port: this.port, pid: process.pid });
  }

  private getRuntime(deviceId?: string): DeviceRuntime {
    const serial = deviceId ?? this.defaultSerial;
    const runtime = this.runtimes.get(serial);
    if (!runtime) {
      throw new Error(`No active device ${serial}.`);
    }
    return runtime;
  }

  private findRuntime(deviceId?: string): DeviceRuntime | undefined {
    return this.runtimes.get(deviceId ?? this.defaultSerial);
  }

  private async ensureTvAwake(runtime: DeviceRuntime): Promise<void> {
    if (!runtime.device.serial) return;
    try {
      const adb = adbBin(findAndroidSdk());
      const { stdout } = await execFileAsync(adb, [
        "-s",
        runtime.device.serial,
        "shell",
        "dumpsys",
        "power",
      ]);
      if (/mWakefulness=(Asleep|Dozing)|Display Power:\s*state=OFF/.test(stdout)) {
        await runtime.engine?.sendInput({
          kind: "key",
          phase: "down",
          keycode: AndroidKeycode.KEYCODE_WAKEUP,
        });
        await runtime.engine?.sendInput({
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
