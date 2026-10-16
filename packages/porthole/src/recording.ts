import { decodeVideoPacket } from "./protocol.js";
import { postSessionJson, type ControlClientOptions } from "./control-client.js";
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
  await postSessionJson("/api/recording/start", { path: opts.output }, opts);
  await new Promise<void>((resolve) => {
    if (opts.durationMs !== undefined) {
      setTimeout(resolve, opts.durationMs);
    } else {
      process.once("SIGINT", () => resolve());
    }
  });
  const { response } = await postSessionJson("/api/recording/stop", {}, opts);
  const result = response as { path: string; samples: number; durationMs: number };
  return { ok: true, ...result };
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
