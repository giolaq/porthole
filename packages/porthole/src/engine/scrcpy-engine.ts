import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbScrcpyClient, AdbScrcpyOptions3_1 } from "@yume-chan/adb-scrcpy";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import { AndroidKeyEventAction, AndroidMotionEventAction } from "@yume-chan/scrcpy";
import type {
  AndroidKeyCode,
  ScrcpyControlMessageWriter,
  ScrcpyMediaStreamPacket,
} from "@yume-chan/scrcpy";
import { ReadableStream } from "@yume-chan/stream-extra";
import type {
  MaybeConsumable,
  ReadableStream as YumeReadableStream,
} from "@yume-chan/stream-extra";
import type { InputEvent } from "../input.js";
import { REMOTE_BUTTON_TO_KEYCODE } from "../keycodes.js";
import { debugLog } from "../log.js";
import type { Engine, EngineMetadata, VideoChunk } from "./types.js";

const execFileAsync = promisify(execFile);

export interface ScrcpyEngineOptions {
  serial: string;
  maxSize?: number;
  maxFps?: number;
  bitrate?: number;
  serverPath?: string;
}

export class ScrcpyEngine implements Engine {
  private readonly serial: string;
  private readonly maxSize: number;
  private readonly maxFps: number;
  private readonly bitrate?: number;
  private readonly serverPath: string;
  private videoCallbacks: Array<(chunk: VideoChunk) => void> = [];
  private closeCallbacks: Array<(error?: Error) => void> = [];
  private client: AdbScrcpyClient<AdbScrcpyOptions3_1<true>> | null = null;
  private controller: ScrcpyControlMessageWriter | null = null;
  private adb: Adb | null = null;
  private _metadata: EngineMetadata | null = null;
  private lastFrame: Uint8Array | null = null;

  get metadata(): EngineMetadata | null {
    return this._metadata;
  }

  constructor(opts: ScrcpyEngineOptions) {
    this.serial = opts.serial;
    this.maxSize = opts.maxSize ?? 1280;
    this.maxFps = opts.maxFps ?? 30;
    this.bitrate = opts.bitrate;
    this.serverPath =
      opts.serverPath ?? join(import.meta.dirname, "../../assets/scrcpy-server");
  }

  async start(): Promise<void> {
    debugLog("engine", `starting scrcpy for ${this.serial}`);
    const connector = new AdbServerNodeTcpConnector({ port: 5037 });
    const serverClient = new AdbServerClient(connector);
    this.adb = await serverClient.createAdb({ serial: this.serial });

    const serverBuf = await readFile(this.serverPath);
    const serverStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(serverBuf));
        controller.close();
      },
    }) as YumeReadableStream<MaybeConsumable<Uint8Array>>;
    await AdbScrcpyClient.pushServer(this.adb, serverStream);

    const options = new AdbScrcpyOptions3_1<true>({
      video: true,
      audio: false,
      control: true,
      maxSize: this.maxSize,
      maxFps: this.maxFps,
      videoBitRate: this.bitrate,
      videoCodec: "h264",
      tunnelForward: false,
      sendFrameMeta: true,
      sendCodecMeta: true,
      sendDeviceMeta: true,
      sendDummyByte: true,
    });

    this.client = await AdbScrcpyClient.start(
      this.adb,
      "/data/local/tmp/scrcpy-server.jar",
      options,
    );

    this.controller = this.client.controller ?? null;

    const videoStream = await this.client.videoStream;
    if (!videoStream) {
      throw new Error("Video stream not available");
    }

    this._metadata = {
      codec: "h264",
      width: videoStream.width,
      height: videoStream.height,
    };

    videoStream.sizeChanged(({ width, height }: { width: number; height: number }) => {
      if (this._metadata) {
        this._metadata = { ...this._metadata, width, height };
      }
    });

    this.consumeVideoStream(videoStream.stream);
  }

  private consumeVideoStream(stream: YumeReadableStream<ScrcpyMediaStreamPacket>): void {
    const reader = stream.getReader();
    const read = async (): Promise<void> => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk: VideoChunk = {
            type: value.type === "configuration" ? "config" : "frame",
            data: value.data,
            timestamp:
              value.type === "data" && value.pts != null ? Number(value.pts) : undefined,
            keyframe: value.type === "data" ? hasIdrNal(value.data) : undefined,
          };

          if (chunk.type === "frame") {
            this.lastFrame = chunk.data;
          }

          for (const cb of this.videoCallbacks) {
            cb(chunk);
          }
        }
      } catch {
        this.emitClose(new Error("scrcpy video stream closed"));
      } finally {
        this.emitClose();
      }
    };
    void read();
  }

  onVideoChunk(cb: (chunk: VideoChunk) => void): void {
    this.videoCallbacks.push(cb);
  }

  onClose(cb: (error?: Error) => void): void {
    this.closeCallbacks.push(cb);
  }

  async sendInput(event: InputEvent): Promise<void> {
    if (!this.controller || !this._metadata) return;

    switch (event.kind) {
      case "touch": {
        const action =
          event.phase === "down"
            ? AndroidMotionEventAction.Down
            : event.phase === "up"
              ? AndroidMotionEventAction.Up
              : AndroidMotionEventAction.Move;
        await this.controller.injectTouch({
          action,
          pointerId: -1n,
          pointerX: Math.round(event.x * this._metadata.width),
          pointerY: Math.round(event.y * this._metadata.height),
          videoWidth: this._metadata.width,
          videoHeight: this._metadata.height,
          pressure: event.phase === "up" ? 0 : 1,
          actionButton: 0,
          buttons: 0,
        });
        break;
      }
      case "key": {
        const action =
          event.phase === "down" ? AndroidKeyEventAction.Down : AndroidKeyEventAction.Up;
        await this.controller.injectKeyCode({
          action,
          keyCode: event.keycode as AndroidKeyCode,
          repeat: 0,
          metaState: 0,
        });
        break;
      }
      case "text": {
        await this.controller.injectText(event.text);
        break;
      }
      case "remote": {
        const keycode = REMOTE_BUTTON_TO_KEYCODE[event.button] as AndroidKeyCode;
        await this.controller.injectKeyCode({
          action: AndroidKeyEventAction.Down,
          keyCode: keycode,
          repeat: 0,
          metaState: 0,
        });
        await this.controller.injectKeyCode({
          action: AndroidKeyEventAction.Up,
          keyCode: keycode,
          repeat: 0,
          metaState: 0,
        });
        break;
      }
    }
  }

  async screenshot(): Promise<Uint8Array> {
    const { stdout } = await execFileAsync(
      "adb",
      ["-s", this.serial, "exec-out", "screencap", "-p"],
      { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 },
    );
    return new Uint8Array(stdout);
  }

  async captureFrame(): Promise<{ data: Uint8Array; mime: string }> {
    return { data: await this.screenshot(), mime: "image/png" };
  }

  async stop(): Promise<void> {
    debugLog("engine", `stopping scrcpy for ${this.serial}`);
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.controller = null;
    this.adb = null;
    this._metadata = null;
    this.lastFrame = null;
    this.videoCallbacks = [];
    this.closeCallbacks = [];
  }

  private emitClose(error?: Error): void {
    const callbacks = [...this.closeCallbacks];
    this.closeCallbacks = [];
    for (const cb of callbacks) cb(error);
  }
}

function hasIdrNal(data: Uint8Array): boolean {
  for (let i = 0; i < data.length - 4; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      let offset = i + 2;
      if (data[offset] === 0) offset++;
      if (data[offset] === 1) {
        const nalByte = data[offset + 1];
        if (nalByte !== undefined && (nalByte & 0x1f) === 5) return true;
      }
    }
  }
  return false;
}
