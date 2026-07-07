import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { Engine, VideoChunk } from "../engine/types.js";
import type { InputEvent } from "../input.js";

export interface WsServerOptions {
  httpServer: Server;
  getEngine: () => Engine | null;
}

export function createWsServer(opts: WsServerOptions) {
  const { httpServer, getEngine } = opts;

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  let currentEngine: Engine | null = null;
  let lastConfig: Buffer | null = null;
  let lastKeyframe: Buffer | null = null;

  function makePacket(chunk: VideoChunk): Buffer {
    const header = Buffer.alloc(5);
    header.writeUInt8(chunk.type === "config" ? 0 : 1, 0);
    header.writeUInt32BE(chunk.data.byteLength, 1);
    return Buffer.concat([header, Buffer.from(chunk.data)]);
  }

  function attachEngine(engine: Engine): void {
    currentEngine = engine;
    engine.onVideoChunk((chunk: VideoChunk) => {
      const packet = makePacket(chunk);

      if (chunk.type === "config") {
        lastConfig = packet;
      } else {
        // Cache keyframes for new clients
        const isKey = hasIdrNal(chunk.data);
        if (isKey) {
          lastKeyframe = packet;
        }
      }

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(packet);
        }
      }
    });
  }

  wss.on("connection", (ws) => {
    // Send cached config + keyframe so late-joining clients can decode immediately
    if (lastConfig) ws.send(lastConfig);
    if (lastKeyframe) ws.send(lastKeyframe);

    ws.on("message", (data) => {
      const engine = getEngine() ?? currentEngine;
      if (!engine) return;

      try {
        const event = JSON.parse(data.toString()) as InputEvent;
        void engine.sendInput(event);
      } catch {
        // Invalid message, ignore
      }
    });
  });

  return { wss, attachEngine };
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
