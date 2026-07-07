import type { InputEvent } from "../input.js";

export interface VideoChunk {
  type: "config" | "frame";
  data: Uint8Array;
  timestamp?: number;
  keyframe?: boolean;
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
  onClose?(cb: (error?: Error) => void): void;
  sendInput(event: InputEvent): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  captureFrame?(): Promise<{ data: Uint8Array; mime: string }>;
  readonly metadata: EngineMetadata | null;
}
