import { useEffect, useRef } from "react";

interface VideoCanvasProps {
  ws: WebSocket | null;
  width: number;
  height: number;
  onStats?: (stats: VideoStats) => void;
}

export interface VideoStats {
  fps: number;
  bitrateKbps: number;
  queue: number;
  resolution: string;
}

function isKeyFrame(data: Uint8Array): boolean {
  for (let i = 0; i < data.length - 4; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      let offset = i + 2;
      if (data[offset] === 0) offset++;
      if (data[offset] === 1) {
        const nalByte = data[offset + 1];
        if (nalByte === undefined) continue;
        const nalType = nalByte & 0x1f;
        if (nalType === 5) return true;
      }
    }
  }
  return false;
}

function parseCodecFromSps(data: Uint8Array): string {
  for (let i = 0; i < data.length - 7; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      let offset = i + 2;
      if (data[offset] === 0) offset++;
      if (data[offset] === 1) {
        const nalByte = data[offset + 1];
        if (nalByte === undefined) continue;
        if ((nalByte & 0x1f) === 7) {
          const profile = data[offset + 2];
          const compat = data[offset + 3];
          const level = data[offset + 4];
          if (profile !== undefined && compat !== undefined && level !== undefined) {
            const hex = (n: number) => n.toString(16).padStart(2, "0");
            return `avc1.${hex(profile)}${hex(compat)}${hex(level)}`;
          }
        }
      }
    }
  }
  return "avc1.42E01F";
}

function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export function VideoCanvas({ ws, width, height, onStats }: VideoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastConfigRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ws) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let configData: Uint8Array | null = lastConfigRef.current;
    let configured = false;
    let waitingForKeyframe = true;
    let frameCount = 0;
    let windowFrames = 0;
    let windowBytes = 0;
    let windowStart = performance.now();
    let decoder: VideoDecoder | null = null;

    if (!("VideoDecoder" in window)) {
      console.warn("[porthole] VideoDecoder unavailable; MJPEG fallback required.");
      return;
    }

    try {
      decoder = new VideoDecoder({
        output: (frame) => {
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        },
        error: (e) => {
          console.error("[porthole] decode error:", e.message);
        },
      });
    } catch (e) {
      console.error("[porthole] VideoDecoder not supported:", e);
      return;
    }

    if (configData) {
      const codec = parseCodecFromSps(configData);
      decoder.configure({ codec, codedWidth: width, codedHeight: height });
      configured = true;
      waitingForKeyframe = true;
    }

    const processMessage = (data: ArrayBuffer) => {
      if (!decoder || decoder.state === "closed") return;

      const packet = decodePacket(data);
      const type = packet.type;
      const payload = packet.payload;
      windowBytes += payload.byteLength;

      if (type === "config") {
        configData = new Uint8Array(payload);
        lastConfigRef.current = configData;
        const codec = parseCodecFromSps(configData);
        console.log(`[porthole] codec=${codec}, config=${configData.length} bytes`);
        decoder.configure({
          codec,
          codedWidth: width,
          codedHeight: height,
        });
        configured = true;
        waitingForKeyframe = true;
        return;
      }

      if (!configured || decoder.state !== "configured") return;

      const keyframe = type === "key" || (type === "delta" && isKeyFrame(payload));
      if (waitingForKeyframe && !keyframe) return;
      if (keyframe) waitingForKeyframe = false;

      const frameData =
        keyframe && configData ? concatBuffers(configData, payload) : payload;

      const chunk = new EncodedVideoChunk({
        type: keyframe ? "key" : "delta",
        timestamp: packet.timestamp || frameCount * (1_000_000 / 30),
        data: frameData,
      });
      frameCount++;
      windowFrames++;
      decoder.decode(chunk);

      const now = performance.now();
      if (now - windowStart >= 1000) {
        onStats?.({
          fps: Math.round((windowFrames * 1000) / (now - windowStart)),
          bitrateKbps: Math.round((windowBytes * 8) / (now - windowStart)),
          queue: decoder.decodeQueueSize,
          resolution: `${width}x${height}`,
        });
        windowFrames = 0;
        windowBytes = 0;
        windowStart = now;
      }
    };

    // Process any buffered messages and handle new ones
    const handleMessage = (event: MessageEvent) => {
      processMessage(event.data as ArrayBuffer);
    };

    ws.addEventListener("message", handleMessage);

    // Replay any messages buffered before this listener was attached
    const wsAny = ws as unknown as Record<string, unknown>;
    const early = wsAny._earlyMessages as ArrayBuffer[] | undefined;
    if (early && early.length > 0) {
      console.log(`[porthole] replaying ${early.length} buffered messages`);
      for (const msg of early) {
        processMessage(msg);
      }
      early.length = 0;
    }
    // Stop buffering — our listener handles new messages directly
    const markDrained = wsAny._markDrained as (() => void) | undefined;
    if (markDrained) markDrained();

    return () => {
      ws.removeEventListener("message", handleMessage);
      if (decoder && decoder.state !== "closed") {
        decoder.close();
      }
    };
  }, [ws, width, height, onStats]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ maxWidth: "100%", height: "auto", display: "block" }}
    />
  );
}

function decodePacket(data: ArrayBuffer): {
  type: "config" | "delta" | "key";
  timestamp: number;
  payload: Uint8Array;
} {
  const view = new DataView(data);
  const rawType = view.getUint8(0);
  const hasV2Header = data.byteLength >= 13;
  const length = view.getUint32(1);
  const timestamp = hasV2Header ? view.getFloat64(5) : 0;
  const offset = hasV2Header ? 13 : 5;
  return {
    type: rawType === 0 ? "config" : rawType === 2 ? "key" : "delta",
    timestamp,
    payload: new Uint8Array(data, offset, length),
  };
}
