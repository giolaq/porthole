import { PNG } from "pngjs";
import type { Engine, EngineMetadata, VideoChunk } from "../../engine/types.js";
import type { EngineInputEvent } from "../../input.js";

export class FakeEngine implements Engine {
  readonly inputs: EngineInputEvent[] = [];
  readonly metadata: EngineMetadata = { codec: "h264", width: 1, height: 1 };
  private readonly listeners = new Set<(chunk: VideoChunk) => void>();
  private readonly png = new Uint8Array(
    PNG.sync.write(new PNG({ width: 1, height: 1 })),
  );

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  onVideoChunk(cb: (chunk: VideoChunk) => void): void {
    this.listeners.add(cb);
  }
  async sendInput(event: EngineInputEvent): Promise<void> {
    this.inputs.push(event);
  }
  async screenshot(): Promise<Uint8Array> {
    return this.png;
  }
  emitChunk(chunk: VideoChunk): void {
    for (const cb of this.listeners) cb(chunk);
  }
}
