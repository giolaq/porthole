import type { InputEvent } from "../input.js";

export interface VideoChunk {
  type: "config" | "frame";
  data: Uint8Array;
  timestamp?: number;
}

export interface EngineMetadata {
  codec: "h264";
  width: number;
  height: number;
}

export interface Engine {
  start(): Promise<void>;
  stop(): Promise<void>;
  onVideoChunk(cb: (chunk: VideoChunk) => void): void;
  sendInput(event: InputEvent): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  readonly metadata: EngineMetadata | null;
}
