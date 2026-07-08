import type { InputEvent, VideoChunk } from "../protocol.js";

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

export type { VideoChunk };
