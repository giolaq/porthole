import { PNG } from "pngjs";
import type { Engine, EngineMetadata, VideoChunk } from "../../engine/types.js";
import type { EngineInputEvent } from "../../input.js";

export class FakeEngine implements Engine {
  readonly inputs: EngineInputEvent[] = [];
  readonly metadata: EngineMetadata = { codec: "h264", width: 1, height: 1 };
  private readonly listeners = new Set<(chunk: VideoChunk) => void>();
  private lastConfig: VideoChunk | null = null;
  private lastKeyframe: VideoChunk | null = null;
  private readonly png = new Uint8Array(PNG.sync.write(new PNG({ width: 1, height: 1 })));

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  onVideoChunk(cb: (chunk: VideoChunk) => void): void {
    this.listeners.add(cb);
    if (this.lastConfig) cb(this.lastConfig);
    if (this.lastKeyframe) cb(this.lastKeyframe);
  }
  async sendInput(event: EngineInputEvent): Promise<void> {
    this.inputs.push(event);
  }
  async screenshot(): Promise<Uint8Array> {
    return this.png;
  }
  emitChunk(chunk: VideoChunk): void {
    if (chunk.type === "config") {
      this.lastConfig = chunk;
      this.lastKeyframe = null;
    }
    if (chunk.type === "frame" && chunk.keyframe) this.lastKeyframe = chunk;
    for (const cb of this.listeners) cb(chunk);
  }
}
