import type { ServerResponse } from "node:http";
import type { Engine } from "../engine/types.js";
import { pngToScaledJpeg } from "./frame-convert.js";

export const MJPEG_BOUNDARY = "porthole-frame";

export function multipartPart(frame: { data: Uint8Array; mime: string }): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${MJPEG_BOUNDARY}\r\nContent-Type: ${frame.mime}\r\nContent-Length: ${frame.data.byteLength}\r\n\r\n`,
    ),
    Buffer.from(frame.data),
    Buffer.from("\r\n"),
  ]);
}

export class MjpegPoller {
  private clients = new Set<ServerResponse>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  constructor(
    private readonly getEngine: () => Engine | null,
    private readonly fps = 3,
  ) {}

  addClient(res: ServerResponse): void {
    this.clients.add(res);
    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Connection: "close",
    });
    res.on("close", () => {
      this.clients.delete(res);
      if (this.clients.size === 0) this.stop();
    });
    this.start();
  }

  private start(): void {
    if (this.timer || this.polling) return;
    this.schedule(0);
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.clients.size === 0 || this.polling) return;
    this.polling = true;
    try {
      const engine = this.getEngine();
      const frame = await (engine?.captureFrame?.() ?? fallbackFrame(engine));
      if (frame) {
        const part = multipartPart(compressFrame(frame));
        for (const client of this.clients) {
          client.write(part);
        }
      }
    } catch {
      // Transient capture errors are expected while the emulator is busy.
    } finally {
      this.polling = false;
      if (this.clients.size > 0) {
        this.schedule(Math.max(100, Math.round(1000 / this.fps)));
      }
    }
  }
}

async function fallbackFrame(
  engine: Engine | null,
): Promise<{ data: Uint8Array; mime: string } | null> {
  if (!engine) return null;
  return { data: await engine.screenshot(), mime: "image/png" };
}

function compressFrame(frame: { data: Uint8Array; mime: string }): {
  data: Uint8Array;
  mime: string;
} {
  if (frame.mime !== "image/png") return frame;
  try {
    return pngToScaledJpeg(frame.data);
  } catch {
    // A malformed capture is better delivered raw than dropped.
    return frame;
  }
}
