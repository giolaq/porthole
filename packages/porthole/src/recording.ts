import { writeFile } from "node:fs/promises";
import WebSocket from "ws";
import { decodeVideoPacket } from "./protocol.js";
import { discoverSession, type ControlClientOptions } from "./control-client.js";
import { createMp4, type H264Sample } from "./mp4-writer.js";

export interface RecordingOptions extends ControlClientOptions {
  output: string;
  durationMs?: number;
}

export interface RecordingResult {
  ok: true;
  path: string;
  samples: number;
  durationMs: number;
}

export async function recordSession(opts: RecordingOptions): Promise<RecordingResult> {
  const session = await discoverSession(opts);
  const health = await fetchHealth(session.url, session.serial);
  const url = websocketUrl(session.url, session.serial);
  const recorder = new H264Recorder(health.width, health.height);
  const startedAt = Date.now();

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ws.close();
      resolve();
    };
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      ws.close();
      reject(error);
    };
    const timeout =
      opts.durationMs === undefined ? undefined : setTimeout(finish, opts.durationMs);

    ws.on("message", (data) => {
      const buffer = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
      recorder.addPacket(buffer);
    });
    ws.on("error", fail);
    ws.on("close", () => {
      if (timeout) clearTimeout(timeout);
      if (!done && opts.durationMs === undefined) resolve();
    });
    process.once("SIGINT", finish);
  });

  const durationMs = Date.now() - startedAt;
  const mp4 = recorder.finalize(durationMs);
  await writeFile(opts.output, mp4);
  return {
    ok: true,
    path: opts.output,
    samples: recorder.sampleCount,
    durationMs,
  };
}

export class H264Recorder {
  #config: Uint8Array | null = null;
  #samples: H264Sample[] = [];
  #started = false;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  get sampleCount(): number {
    return this.#samples.length;
  }

  addPacket(data: Uint8Array): void {
    const packet = decodeVideoPacket(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    if (packet.type === "config") {
      this.#config = packet.data;
      return;
    }
    const keyframe = packet.type === "key" || hasIdrNal(packet.data);
    if (!this.#started) {
      if (!keyframe) return;
      this.#started = true;
    }
    this.#samples.push({
      data: packet.data,
      timestamp: packet.timestamp || this.#samples.length * 33_333,
      keyframe,
    });
  }

  finalize(durationMs?: number): Uint8Array {
    if (!this.#config) throw new Error("Recording did not receive H.264 config data.");
    if (this.#samples.length === 0)
      throw new Error("Recording did not receive a keyframe.");
    return createMp4({
      width: this.width,
      height: this.height,
      durationMs,
      config: this.#config,
      samples: this.#samples,
    });
  }
}

async function fetchHealth(
  sessionUrl: string,
  deviceId: string,
): Promise<{ width: number; height: number }> {
  const url = new URL(sessionUrl);
  url.pathname = "/health";
  url.searchParams.set("device", deviceId);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to read session health: ${response.status}`);
  const body = (await response.json()) as { width?: number; height?: number };
  if (!body.width || !body.height)
    throw new Error("Session health does not include video dimensions.");
  return { width: body.width, height: body.height };
}

function websocketUrl(sessionUrl: string, deviceId: string): string {
  const url = new URL(sessionUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.searchParams.set("device", deviceId);
  return url.toString();
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
